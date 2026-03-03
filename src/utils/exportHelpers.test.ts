import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockDoc = {
  internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
  setFont: vi.fn(),
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  setDrawColor: vi.fn(),
  setFillColor: vi.fn(),
  setLineWidth: vi.fn(),
  text: vi.fn(),
  line: vi.fn(),
  roundedRect: vi.fn(),
  addImage: vi.fn(),
  addPage: vi.fn(),
  splitTextToSize: vi.fn().mockReturnValue(['line1', 'line2']),
  getTextWidth: vi.fn().mockReturnValue(30),
  getNumberOfPages: vi.fn().mockReturnValue(1),
  setPage: vi.fn(),
  save: vi.fn(),
};

vi.mock('jspdf', () => {
  return { default: vi.fn(function () { return mockDoc; }) };
});
vi.mock('jspdf-autotable', () => ({}));

vi.mock('docx', () => ({
  Document: vi.fn(),
  Packer: { toBlob: vi.fn().mockResolvedValue(new Blob(['test'])) },
  Paragraph: vi.fn(),
  TextRun: vi.fn(),
  HeadingLevel: { HEADING_1: 'HEADING_1', HEADING_2: 'HEADING_2' },
  AlignmentType: { CENTER: 'CENTER' },
}));

vi.mock('./forgeHelpers', () => ({
  stripMarkdown: vi.fn((text: string) => text.replace(/[#*_]/g, '')),
}));

import { generateFilename, exportAsText, exportAsPDF, exportAsDocx } from './exportHelpers';
import jsPDF from 'jspdf';

describe('exportHelpers', () => {
  describe('generateFilename', () => {
    it('generates a basic filename with contentType, title, date, and extension', () => {
      const result = generateFilename('blog', 'My First Post', '2024-06-15', 'txt');
      expect(result).toBe('madison-blog-my-first-post-2024-06-15.txt');
    });

    it('replaces special characters in the title with dashes', () => {
      const result = generateFilename('article', 'Hello, World! @2024 #test', '2024-01-01', 'pdf');
      expect(result).toBe('madison-article-hello-world-2024-test-2024-01-01.pdf');
    });

    it('truncates titles longer than 50 characters', () => {
      const longTitle = 'This is an extremely long title that should definitely be truncated to fifty characters maximum';
      const result = generateFilename('post', longTitle, '2024-03-20', 'docx');
      // Format: madison-{contentType}-{cleanTitle}-{date}.{ext}
      const filenameWithoutExt = result.replace('.docx', '');
      const cleanTitle = filenameWithoutExt
        .replace('madison-post-', '')
        .replace(/-\d{4}-\d{2}-\d{2}$/, '');
      expect(cleanTitle.length).toBeLessThanOrEqual(50);
    });

    it('removes leading and trailing dashes from the cleaned title', () => {
      const result = generateFilename('content', '---Hello World---', '2024-07-04', 'txt');
      expect(result).toBe('madison-content-hello-world-2024-07-04.txt');
    });

    it('handles various date formats and converts them to ISO format', () => {
      const result1 = generateFilename('blog', 'Test', '2024-06-15T10:30:00Z', 'txt');
      expect(result1).toBe('madison-blog-test-2024-06-15.txt');

      const result2 = generateFilename('blog', 'Test', 'June 15, 2024', 'txt');
      expect(result2).toBe('madison-blog-test-2024-06-15.txt');

      const result3 = generateFilename('blog', 'Test', '2024/06/15', 'txt');
      expect(result3).toBe('madison-blog-test-2024-06-15.txt');
    });

    it('converts title to lowercase', () => {
      const result = generateFilename('blog', 'MY UPPERCASE TITLE', '2024-01-01', 'pdf');
      expect(result).toBe('madison-blog-my-uppercase-title-2024-01-01.pdf');
    });

    it('collapses consecutive non-alphanumeric characters into a single dash', () => {
      const result = generateFilename('blog', 'Hello   &&&   World', '2024-01-01', 'txt');
      expect(result).toBe('madison-blog-hello-world-2024-01-01.txt');
    });
  });

  describe('exportAsText', () => {
    let mockLink: { href: string; download: string; click: ReturnType<typeof vi.fn> };
    let createObjectURLMock: ReturnType<typeof vi.fn>;
    let revokeObjectURLMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockLink = { href: '', download: '', click: vi.fn() };
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
      createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/fake-url');
      revokeObjectURLMock = vi.fn();
      globalThis.URL.createObjectURL = createObjectURLMock;
      globalThis.URL.revokeObjectURL = revokeObjectURLMock;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('creates a blob and triggers a download', () => {
      const content = 'This is test content';
      const metadata = {
        title: 'Test Export',
        contentType: 'blog',
        createdAt: '2024-06-15',
      };

      exportAsText(content, metadata);

      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(createObjectURLMock).toHaveBeenCalledWith(expect.any(Blob));
      expect(mockLink.click).toHaveBeenCalled();
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/fake-url');
    });

    it('sets the download filename using the correct format', () => {
      const content = 'Some content here';
      const metadata = {
        title: 'My Article',
        contentType: 'article',
        createdAt: '2024-03-10',
      };

      exportAsText(content, metadata);

      expect(mockLink.download).toBe('madison-article-my-article-2024-03-10.txt');
    });

    it('defaults contentType to "content" when not provided', () => {
      const content = 'Some content';
      const metadata = {
        title: 'No Type',
        createdAt: '2024-01-01',
      };

      exportAsText(content, metadata);

      expect(mockLink.download).toBe('madison-content-no-type-2024-01-01.txt');
    });
  });

  describe('exportAsPDF', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Reset the return values that clearAllMocks removed
      mockDoc.splitTextToSize.mockReturnValue(['line1', 'line2']);
      mockDoc.getTextWidth.mockReturnValue(30);
      mockDoc.getNumberOfPages.mockReturnValue(1);
    });

    it('creates a PDF document with portrait A4 configuration', () => {
      const content = 'Test PDF content';
      const metadata = {
        title: 'PDF Test',
        contentType: 'blog',
        createdAt: '2024-06-15',
      };

      exportAsPDF(content, metadata);

      expect(jsPDF).toHaveBeenCalledWith({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
    });

    it('calls save with the correct filename', () => {
      const content = 'Test PDF content';
      const metadata = {
        title: 'PDF Test',
        contentType: 'blog',
        createdAt: '2024-06-15',
      };

      exportAsPDF(content, metadata);

      expect(mockDoc.save).toHaveBeenCalledWith('madison-blog-pdf-test-2024-06-15.pdf');
    });

    it('sets the title text on the document', () => {
      const content = 'Some body content';
      const metadata = {
        title: 'My Document Title',
        contentType: 'article',
        createdAt: '2024-01-15',
      };

      exportAsPDF(content, metadata);

      expect(mockDoc.splitTextToSize).toHaveBeenCalledWith(
        'My Document Title',
        expect.any(Number)
      );
    });

    it('defaults contentType to "content" when not provided', () => {
      const content = 'Test content';
      const metadata = {
        title: 'No Type PDF',
        createdAt: '2024-02-20',
      };

      exportAsPDF(content, metadata);

      expect(mockDoc.save).toHaveBeenCalledWith('madison-content-no-type-pdf-2024-02-20.pdf');
    });
  });

  describe('exportAsDocx', () => {
    let mockLink: { href: string; download: string; click: ReturnType<typeof vi.fn> };
    let createObjectURLMock: ReturnType<typeof vi.fn>;
    let revokeObjectURLMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockLink = { href: '', download: '', click: vi.fn() };
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
      createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/fake-docx-url');
      revokeObjectURLMock = vi.fn();
      globalThis.URL.createObjectURL = createObjectURLMock;
      globalThis.URL.revokeObjectURL = revokeObjectURLMock;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('creates a document and triggers a download', async () => {
      const content = 'Test docx content';
      const metadata = {
        title: 'Docx Test',
        contentType: 'blog',
        createdAt: '2024-06-15',
      };

      await exportAsDocx(content, metadata);

      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(createObjectURLMock).toHaveBeenCalledWith(expect.any(Blob));
      expect(mockLink.click).toHaveBeenCalled();
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/fake-docx-url');
    });

    it('sets the download filename using the correct format', async () => {
      const content = 'Some content';
      const metadata = {
        title: 'My Docx Report',
        contentType: 'report',
        createdAt: '2024-09-01',
      };

      await exportAsDocx(content, metadata);

      expect(mockLink.download).toBe('madison-report-my-docx-report-2024-09-01.docx');
    });

    it('defaults contentType to "content" when not provided', async () => {
      const content = 'Content without type';
      const metadata = {
        title: 'Untitled',
        createdAt: '2024-05-05',
      };

      await exportAsDocx(content, metadata);

      expect(mockLink.download).toBe('madison-content-untitled-2024-05-05.docx');
    });
  });
});
