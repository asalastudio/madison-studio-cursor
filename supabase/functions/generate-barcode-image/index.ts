import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;


interface BarcodeInput {
  code: string;
  type: "upc-a" | "ean-13" | "code-128" | "qr";
  product_id?: string;
  organization_id?: string;
  save_to_dam?: boolean;
  options?: {
    width?: number;
    height?: number;
    margin?: number;
    display_value?: boolean;
    font_size?: number;
    background?: string;
    line_color?: string;
  };
}

// Encoding tables for different barcode types
const UPC_LEFT_ODD: Record<string, string> = {
  "0": "0001101", "1": "0011001", "2": "0010011", "3": "0111101", "4": "0100011",
  "5": "0110001", "6": "0101111", "7": "0111011", "8": "0110111", "9": "0001011",
};

const UPC_RIGHT: Record<string, string> = {
  "0": "1110010", "1": "1100110", "2": "1101100", "3": "1000010", "4": "1011100",
  "5": "1001110", "6": "1010000", "7": "1000100", "8": "1001000", "9": "1110100",
};

const EAN_PATTERNS: Record<string, string> = {
  "0": "LLLLLL", "1": "LLGLGG", "2": "LLGGLG", "3": "LLGGGL", "4": "LGLLGG",
  "5": "LGGLLG", "6": "LGGGLL", "7": "LGLGLG", "8": "LGLGGL", "9": "LGGLGL",
};

const EAN_LEFT_G: Record<string, string> = {
  "0": "0100111", "1": "0110011", "2": "0011011", "3": "0100001", "4": "0011101",
  "5": "0111001", "6": "0000101", "7": "0010001", "8": "0001001", "9": "0010111",
};

serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const input = await req.json() as BarcodeInput;
    
    console.log("[generate-barcode] Generating", input.type, "for:", input.code);

    // Validate and clean the code
    let cleanCode = input.code.replace(/\D/g, "");
    
    // Validate code length based on type
    if (input.type === "upc-a" && cleanCode.length !== 12) {
      // Add check digit if 11 digits provided
      if (cleanCode.length === 11) {
        cleanCode += calculateUPCCheckDigit(cleanCode);
      } else {
        throw new Error("UPC-A requires 12 digits (or 11 + auto check digit)");
      }
    }
    
    if (input.type === "ean-13" && cleanCode.length !== 13) {
      // Add check digit if 12 digits provided
      if (cleanCode.length === 12) {
        cleanCode += calculateEANCheckDigit(cleanCode);
      } else {
        throw new Error("EAN-13 requires 13 digits (or 12 + auto check digit)");
      }
    }

    // Default options
    const opts = {
      width: input.options?.width || 200,
      height: input.options?.height || 80,
      margin: input.options?.margin || 10,
      display_value: input.options?.display_value ?? true,
      font_size: input.options?.font_size || 12,
      background: input.options?.background || "#FFFFFF",
      line_color: input.options?.line_color || "#000000",
    };

    // Generate barcode binary pattern
    let binaryPattern: string;
    
    switch (input.type) {
      case "upc-a":
        binaryPattern = generateUPCAPattern(cleanCode);
        break;
      case "ean-13":
        binaryPattern = generateEAN13Pattern(cleanCode);
        break;
      case "code-128":
        binaryPattern = generateCode128Pattern(cleanCode);
        break;
      default:
        throw new Error(`Barcode type ${input.type} not supported`);
    }

    // Generate SVG
    const svg = generateSVG(binaryPattern, cleanCode, opts);

    // Optionally save to DAM
    let damAssetId = null;
    if (input.save_to_dam && input.organization_id && input.product_id) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      // Convert SVG to base64 for storage
      const svgBase64 = btoa(svg);
      const fileName = `barcode_${input.type}_${cleanCode}.svg`;
      
      // Upload to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("assets")
        .upload(
          `${input.organization_id}/barcodes/${fileName}`,
          Uint8Array.from(atob(svgBase64), (c) => c.charCodeAt(0)),
          {
            contentType: "image/svg+xml",
            upsert: true,
          }
        );

      if (uploadError) {
        console.error("[generate-barcode] Upload error:", uploadError);
      } else {
        // Get public URL
        const { data: urlData } = supabase.storage
          .from("assets")
          .getPublicUrl(uploadData.path);

        // Create DAM asset record
        const { data: assetData, error: assetError } = await supabase
          .from("dam_assets")
          .insert({
            organization_id: input.organization_id,
            file_name: fileName,
            original_name: fileName,
            file_type: "image/svg+xml",
            file_size: svg.length,
            storage_path: uploadData.path,
            public_url: urlData.publicUrl,
            asset_type: "barcode",
            status: "active",
            metadata: {
              barcode_type: input.type,
              barcode_value: cleanCode,
              auto_generated: true,
            },
          })
          .select()
          .single();

        if (!assetError && assetData) {
          damAssetId = assetData.id;

          // Link to product
          await supabase.from("product_hub_assets").insert({
            product_id: input.product_id,
            asset_id: damAssetId,
            relationship_type: "barcode",
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        code: cleanCode,
        type: input.type,
        svg,
        svg_base64: `data:image/svg+xml;base64,${btoa(svg)}`,
        dam_asset_id: damAssetId,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[generate-barcode] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function calculateUPCCheckDigit(code: string): string {
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += parseInt(code[i]) * (i % 2 === 0 ? 3 : 1);
  }
  return ((10 - (sum % 10)) % 10).toString();
}

function calculateEANCheckDigit(code: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return ((10 - (sum % 10)) % 10).toString();
}

function generateUPCAPattern(code: string): string {
  // Start guard
  let pattern = "101";
  
  // Left side (6 digits)
  for (let i = 0; i < 6; i++) {
    pattern += UPC_LEFT_ODD[code[i]];
  }
  
  // Center guard
  pattern += "01010";
  
  // Right side (6 digits)
  for (let i = 6; i < 12; i++) {
    pattern += UPC_RIGHT[code[i]];
  }
  
  // End guard
  pattern += "101";
  
  return pattern;
}

function generateEAN13Pattern(code: string): string {
  const firstDigit = code[0];
  const parityPattern = EAN_PATTERNS[firstDigit];
  
  // Start guard
  let pattern = "101";
  
  // Left side (6 digits, positions 1-6)
  for (let i = 0; i < 6; i++) {
    const digit = code[i + 1];
    if (parityPattern[i] === "L") {
      pattern += UPC_LEFT_ODD[digit];
    } else {
      pattern += EAN_LEFT_G[digit];
    }
  }
  
  // Center guard
  pattern += "01010";
  
  // Right side (6 digits, positions 7-12)
  for (let i = 7; i < 13; i++) {
    pattern += UPC_RIGHT[code[i]];
  }
  
  // End guard
  pattern += "101";
  
  return pattern;
}

function generateCode128Pattern(code: string): string {
  // Simplified Code 128 implementation (Code Set B for alphanumeric)
  const CODE128_START_B = "11010010000";
  const CODE128_STOP = "1100011101011";
  
  const CODE128_VALUES: Record<string, string> = {
    " ": "11011001100", "!": "11001101100", "\"": "11001100110",
    "#": "10010011000", "$": "10010001100", "%": "10001001100",
    "&": "10011001000", "'": "10011000100", "(": "10001100100",
    ")": "11001001000", "*": "11001000100", "+": "11000100100",
    ",": "10110011100", "-": "10011011100", ".": "10011001110",
    "/": "10111001100", "0": "10011101100", "1": "10011100110",
    "2": "11001110010", "3": "11001011100", "4": "11001001110",
    "5": "11011100100", "6": "11001110100", "7": "11101101110",
    "8": "11101001100", "9": "11100101100", ":": "11100100110",
  };
  
  let pattern = CODE128_START_B;
  let checksum = 104; // Start B value
  
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if (CODE128_VALUES[char]) {
      pattern += CODE128_VALUES[char];
      checksum += (char.charCodeAt(0) - 32) * (i + 1);
    }
  }
  
  // Add checksum character
  const checksumChar = String.fromCharCode((checksum % 103) + 32);
  if (CODE128_VALUES[checksumChar]) {
    pattern += CODE128_VALUES[checksumChar];
  }
  
  pattern += CODE128_STOP;
  
  return pattern;
}

function generateSVG(
  pattern: string,
  code: string,
  opts: {
    width: number;
    height: number;
    margin: number;
    display_value: boolean;
    font_size: number;
    background: string;
    line_color: string;
  }
): string {
  const barWidth = (opts.width - opts.margin * 2) / pattern.length;
  const barHeight = opts.display_value ? opts.height - opts.margin - opts.font_size - 5 : opts.height - opts.margin * 2;
  
  let bars = "";
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "1") {
      bars += `<rect x="${opts.margin + i * barWidth}" y="${opts.margin}" width="${barWidth}" height="${barHeight}" fill="${opts.line_color}"/>`;
    }
  }

  const textY = opts.height - opts.margin;
  const text = opts.display_value
    ? `<text x="${opts.width / 2}" y="${textY}" text-anchor="middle" font-family="monospace" font-size="${opts.font_size}" fill="${opts.line_color}">${code}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}">
  <rect width="100%" height="100%" fill="${opts.background}"/>
  ${bars}
  ${text}
</svg>`;
}
