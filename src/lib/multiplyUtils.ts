import { parseEmailSequence } from "@/lib/emailSequence";
import { RawDerivativeResponse } from "@/types/multiply";

export const buildSequenceEmailsFromDerivative = (derivative: RawDerivativeResponse) => {
    if (derivative?.platform_specs?.emails?.length) {
        return derivative.platform_specs.emails.map((email, index) => {
            const body = email?.body || "";
            return {
                id: `${derivative.id}-email-${index + 1}`,
                sequenceNumber: index + 1,
                subject: email?.subject || `Email ${index + 1}`,
                preview: email?.preview || body.slice(0, 140),
                content: body,
                charCount: body.length,
            };
        });
    }

    const parsed = parseEmailSequence(derivative?.generated_content || "");

    return parsed.map((part, index) => ({
        id: `${derivative.id}-parsed-${index + 1}`,
        sequenceNumber: index + 1,
        subject: part.subject || `Email ${index + 1}`,
        preview: part.preview || part.content.slice(0, 140),
        content: part.content,
        charCount: part.content.length,
    }));
};

export const buildSequencePlatformSpecsFromContent = (content: string, sequenceType?: string) => {
    const emails = parseEmailSequence(content).map((part) => ({
        subject: part.subject,
        preview: part.preview,
        body: part.content,
    }));

    return {
        emailCount: emails.length,
        emails,
        ...(sequenceType ? { sequenceType } : {}),
    };
};

export const serializeSequenceEmails = (
    emails: Array<{
        sequenceNumber?: number;
        subject: string;
        preview: string;
        content: string;
    }>
) => {
    return emails
        .map((email, index) => {
            const sequenceNumber = email.sequenceNumber ?? index + 1;
            const lines: string[] = [];

            lines.push(`Email ${sequenceNumber}`);
            if (email.subject) lines.push(`Subject: ${email.subject}`);
            if (email.preview) lines.push(`Preview: ${email.preview}`);
            lines.push("");
            lines.push(email.content.trim());

            return lines.join("\n");
        })
        .join("\n\n---\n\n");
};
