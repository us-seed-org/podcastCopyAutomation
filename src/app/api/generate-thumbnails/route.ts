import { NextRequest, NextResponse } from "next/server";
import type { ChannelStyle, GuestInput, ProcessedGuest } from "@/types/thumbnail";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const THUMBNAIL_IMAGE_MODEL =
  process.env.THUMBNAIL_IMAGE_MODEL || "gemini-3.1-pro-preview";
const THUMBNAIL_TEXT_MODEL =
  process.env.THUMBNAIL_TEXT_MODEL || "gemini-3.1-flash";

// ── Helpers ─────────────────────────────────────────────────────────────────

async function fetchImageAsBase64(imageUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let imgResp: Response;
    try {
      imgResp = await fetch(imageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ThumbnailBot/1.0)",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!imgResp.ok) return null;

    const arrayBuf = await imgResp.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    const base64 = Buffer.from(bytes).toString("base64");
    const ext =
      imageUrl.split("?")[0].split(".").pop()?.toLowerCase() ?? "jpg";
    const mime =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg";
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}

async function findGuestHeadshot(
  guestName: string
): Promise<string | null> {
  // Wikipedia search
  try {
    console.log(`[Headshot] Searching Wikipedia for "${guestName}"…`);
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(guestName)}&srlimit=1&format=json&origin=*`;
    const searchResp = await fetch(searchUrl);
    if (searchResp.ok) {
      const searchData = await searchResp.json();
      const pageTitle = searchData?.query?.search?.[0]?.title;
      if (pageTitle) {
        console.log(`[Headshot] Wikipedia found page: "${pageTitle}"`);
        const imgUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=pageimages&piprop=original&format=json&origin=*`;
        const imgResp = await fetch(imgUrl);
        if (imgResp.ok) {
          const imgData = await imgResp.json();
          const pages = imgData.query?.pages;
          const page = pages
            ? (Object.values(pages)[0] as Record<string, unknown>)
            : null;
          const imageUrl = (page?.original as Record<string, unknown>)
            ?.source as string | undefined;
          if (imageUrl) {
            console.log(`[Headshot] Wikipedia image found: ${imageUrl}`);
            const b64 = await fetchImageAsBase64(imageUrl);
            if (b64) return b64;
          }
        }
      }
    }
    console.log(
      `[Headshot] Wikipedia: no image found for "${guestName}"`
    );
  } catch (err) {
    console.warn("[Headshot] Wikipedia lookup error:", err);
  }

  // DuckDuckGo fallback
  try {
    console.log(
      `[Headshot] Trying DuckDuckGo image search for "${guestName}"…`
    );
    const ddgQuery = encodeURIComponent(`${guestName} headshot portrait`);
    const ddgHtmlResp = await fetch(
      `https://duckduckgo.com/?q=${ddgQuery}&iax=images&ia=images`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ThumbnailBot/1.0)",
        },
      }
    );
    if (ddgHtmlResp.ok) {
      const html = await ddgHtmlResp.text();
      const vqd = html.match(/vqd=['"]([^'"]+)['"]/)?.[1];
      if (vqd) {
        const ijsResp = await fetch(
          `https://duckduckgo.com/i.js?q=${ddgQuery}&vqd=${encodeURIComponent(vqd)}&o=json`,
          {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; ThumbnailBot/1.0)",
            },
          }
        );
        if (ijsResp.ok) {
          const imageData = await ijsResp.json();
          const firstImageUrl = imageData?.results?.[0]?.image;
          if (firstImageUrl) {
            console.log(
              `[Headshot] DuckDuckGo image found: ${firstImageUrl}`
            );
            const b64 = await fetchImageAsBase64(firstImageUrl);
            if (b64) return b64;
          }
        }
      }
    }
    console.log(
      `[Headshot] DuckDuckGo: no image found for "${guestName}"`
    );
  } catch (err) {
    console.warn("[Headshot] DuckDuckGo lookup error:", err);
  }

  return null;
}

async function removeBackground(imageBase64: string): Promise<string> {
  if (!GOOGLE_API_KEY)
    throw new Error("GOOGLE_API_KEY not configured");

  console.log("[Headshot] Removing background…");

  // Extract raw base64 and mime type from data URL
  const dataUrlMatch = imageBase64.match(
    /^data:(image\/\w+);base64,(.+)$/
  );
  const mimeType = dataUrlMatch?.[1] ?? "image/jpeg";
  const rawBase64 = dataUrlMatch?.[2] ?? imageBase64;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${THUMBNAIL_IMAGE_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GOOGLE_API_KEY! },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: "Remove the background from this photo of a person. Make the background completely pure white. Keep only the person with clean, sharp edges. Do not alter the person's appearance, lighting, or colors — only remove the background.",
              },
              {
                inlineData: { mimeType, data: rawBase64 },
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[Headshot] BG removal error ${resp.status}:`, text);
    console.warn(
      "[Headshot] Background removal failed, using original image"
    );
    return imageBase64;
  }

  const json = await resp.json();
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find(
    (p: Record<string, unknown>) => p.inlineData
  );
  if (imagePart?.inlineData?.data) {
    const outMime = imagePart.inlineData.mimeType ?? "image/png";
    console.log("[Headshot] Background removed successfully");
    return `data:${outMime};base64,${imagePart.inlineData.data}`;
  }

  console.warn(
    "[Headshot] No image returned from BG removal, using original"
  );
  return imageBase64;
}

async function processGuests(
  guests: GuestInput[]
): Promise<ProcessedGuest[]> {
  const results: ProcessedGuest[] = [];
  for (const guest of guests) {
    let rawImage: string | null = guest.headshotBase64 ?? null;
    if (!rawImage && guest.name.trim()) {
      rawImage = await findGuestHeadshot(guest.name.trim());
    }
    let cleanedHeadshot: string | undefined;
    if (rawImage) {
      cleanedHeadshot = await removeBackground(rawImage);
    }
    results.push({ name: guest.name, cleanedHeadshot });
  }
  return results;
}

async function generateVariantCopy(
  titleText: string,
  channelStyle: ChannelStyle,
  count: number
): Promise<string[]> {
  if (!GOOGLE_API_KEY)
    throw new Error("GOOGLE_API_KEY not configured");

  console.log("[Copy] Generating variant thumbnail copy…");

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GOOGLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: THUMBNAIL_TEXT_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You generate short, punchy thumbnail overlay text for YouTube podcast thumbnails. Each line must be 2-5 words, all caps, and convey a different angle/hook of the episode. IMPORTANT: Never include quotation marks in any variant text. Return clean text only.",
          },
          {
            role: "user",
            content: `Episode title: "${titleText}"
Channel vibe: ${channelStyle.overallVibe}
Text style: ${channelStyle.textStyle}

Generate exactly ${count} different short thumbnail overlay text options. Each should highlight a different hook or angle. Return ONLY a JSON array of strings, nothing else.

Example: ["MIND = BLOWN", "THE UNTOLD TRUTH", "NOBODY EXPECTED THIS"]`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_copy_variants",
              description: `Return exactly ${count} thumbnail overlay text variants`,
              parameters: {
                type: "object",
                properties: {
                  variants: {
                    type: "array",
                    items: { type: "string" },
                    description:
                      "Array of short thumbnail overlay texts, 2-5 words each, all caps",
                  },
                },
                required: ["variants"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "return_copy_variants" },
        },
      }),
    }
  );

  if (!resp.ok) {
    console.error(`[Copy] Variant copy error ${resp.status}`);
    const words = titleText.split(" ");
    return Array.from({ length: count }, (_, i) => {
      const start = i * 2;
      return (
        words
          .slice(start, start + 3)
          .join(" ")
          .toUpperCase() || `VARIANT ${i + 1}`
      );
    });
  }

  const json = await resp.json();
  const cleanVariant = (v: string) => v.replace(/^["'\u201c\u201d\u2018\u2019]+|["'\u201c\u201d\u2018\u2019]+$/g, "").trim();

  let variants: string[] = [];

  try {
    const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const args = JSON.parse(toolCall.function.arguments);
      if (Array.isArray(args.variants)) {
        variants = args.variants.map(cleanVariant);
      }
    }

    if (variants.length < count) {
      const content = json.choices?.[0]?.message?.content;
      if (content) {
        const match = content.match(/\[[\s\S]*?\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed)) {
            variants.push(...parsed.map(cleanVariant));
          }
        }
      }
    }
  } catch (e) {
    console.error("[Copy] Parse error:", e);
  }

  if (variants.length >= count) {
    console.log("[Copy] Generated variants:", variants.slice(0, count));
    return variants.slice(0, count);
  }

  const words = titleText.split(" ");
  const slicePatterns: [number, number][] = [[0, 3], [1, 4], [0, 4], [2, 5], [0, 2]];
  while (variants.length < count) {
    const [start, end] = slicePatterns[variants.length % slicePatterns.length];
    const text = words.slice(start, end).join(" ").toUpperCase();
    variants.push(text || `VARIANT ${variants.length + 1}`);
  }
  console.log("[Copy] Generated variants (with fallback):", variants.slice(0, count));
  return variants.slice(0, count);
}

async function generateSingleThumbnail(
  channelStyle: ChannelStyle,
  titleText: string,
  thumbnailText: string,
  variantIndex: number,
  processedGuests: ProcessedGuest[],
  referenceThumbUrls: string[]
): Promise<{ imageBase64: string; description: string }> {
  if (!GOOGLE_API_KEY)
    throw new Error("GOOGLE_API_KEY not configured");

  const styleDescription = `
Layout: ${channelStyle.layout}
Colors: ${channelStyle.colorPalette.join(", ")}
Text Style: ${channelStyle.textStyle}
Photo Treatment: ${channelStyle.photoTreatment}
Brand Elements: ${channelStyle.brandElements}
Overall Vibe: ${channelStyle.overallVibe}`;

  const variantInstructions = [
    "Create the primary thumbnail replicating the reference channel style as faithfully as possible — same layout, fonts, colors, and photo treatment.",
    "Create a variation with slightly bolder text and a stronger accent color from the palette, while keeping the same overall brand feel as the references.",
    "Create a variation with a different compositional arrangement (e.g. swap guest position or text placement) while matching the same visual identity as the references.",
  ];

  const guestsWithHeadshots = processedGuests.filter(
    (g) => g.cleanedHeadshot
  );
  let headshotInstructions: string;
  if (guestsWithHeadshots.length === 0) {
    headshotInstructions =
      "- No guest headshot available — use the layout without a guest photo, or use a subtle silhouette placeholder.";
  } else if (guestsWithHeadshots.length === 1) {
    headshotInstructions = `- A guest headshot for "${guestsWithHeadshots[0].name}" is provided (background already removed, white bg).
  - Place the guest prominently following the channel's photo treatment style.
  - COLOR-CORRECT the guest photo to match the channel's lighting, color temperature, and shadow/highlight treatment.
  - Apply similar visual effects (contrast, saturation, color grading) as seen in the reference thumbnails.
  - Blend the guest naturally into the thumbnail composition.`;
  } else {
    const positions = [
      "left",
      "right",
      "center-left",
      "center-right",
      "top",
      "bottom",
    ];
    headshotInstructions = guestsWithHeadshots
      .map(
        (g, idx) =>
          `- Guest "${g.name}" headshot provided (background removed). Place on the ${positions[idx] ?? "side"} of the frame.`
      )
      .join("\n  ");
    headshotInstructions += `
  - COLOR-CORRECT all guest photos to match each other and the channel's lighting/color temperature.
  - Apply consistent visual treatment (contrast, saturation) across all guests as seen in the references.
  - Ensure guests are proportionally scaled to look natural together.`;
  }

  const brandInstructions = channelStyle.brandElements
    ? `\n## BRAND ASSETS TO INCLUDE:\n- Replicate brand elements identified: ${channelStyle.brandElements}\n- These elements (logos, borders, banners, watermarks) should appear in their expected positions as seen in the reference thumbnails.`
    : "";

  const prompt = `Generate a YouTube podcast thumbnail (1280x720 pixels, 16:9 aspect ratio).

## CRITICAL: MATCH THE REFERENCE STYLE
The reference thumbnails above show the EXACT visual style of this channel. You MUST replicate:
- The same layout structure (where text sits, where photos sit)
- The same color palette and background treatment
- The same font weight/style and text placement
- The same photo treatment and color grading
- Any consistent brand elements (logo placement, borders, overlays)

## CHANNEL STYLE DETAILS:
${styleDescription}

## CONTENT FOR THIS THUMBNAIL:
- Episode title: "${titleText}"
- Thumbnail overlay text: ${thumbnailText} (LARGE, PROMINENT text — render as large overlay text, absolutely NO quotation marks around it)
${headshotInstructions}
${brandInstructions}

## VARIANT INSTRUCTION:
${variantInstructions[variantIndex] || variantInstructions[0]}

## NON-NEGOTIABLE RULES:
- The thumbnail text ${thumbnailText} must be HUGE and readable on mobile — do NOT render quotation marks
- Use high contrast between text and background
- Professional podcast thumbnail quality matching the references exactly
- 1280x720 pixels, 16:9 aspect ratio
- Make it scroll-stopping and click-worthy`;

  // Build multipart content for Gemini native API
  const parts: Array<Record<string, unknown>> = [];

  // Add reference thumbnails (up to 3)
  const refs = referenceThumbUrls.slice(0, 3);
  if (refs.length > 0) {
    parts.push({
      text: "Here are real thumbnails from this channel. Study and EXACTLY replicate this visual style — layout, colors, typography, photo treatment, and brand elements:",
    });
    // Fetch reference thumbnails as base64
    const refResults = await Promise.all(refs.map((url) => fetchImageAsBase64(url)));
    for (const b64 of refResults) {
      if (b64) {
        const match = b64.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: { mimeType: match[1], data: match[2] },
          });
        }
      }
    }
  }

  // Main prompt
  parts.push({ text: prompt });

  // Add guest headshots
  for (const guest of guestsWithHeadshots) {
    parts.push({
      text: `Guest headshot for "${guest.name}" (background removed — composite into thumbnail):`,
    });
    const match = guest.cleanedHeadshot!.match(
      /^data:(image\/\w+);base64,(.+)$/
    );
    if (match) {
      parts.push({
        inlineData: { mimeType: match[1], data: match[2] },
      });
    }
  }

  console.log(
    `[Thumbnail] Generating variant ${variantIndex + 1} with copy: "${thumbnailText}", ${refs.length} reference thumbs, ${guestsWithHeadshots.length} guest(s)…`
  );

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${THUMBNAIL_IMAGE_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GOOGLE_API_KEY! },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[Thumbnail] AI error ${resp.status}:`, text);
    if (resp.status === 429)
      throw new Error("Rate limit exceeded. Please wait and try again.");
    throw new Error(`AI error ${resp.status}`);
  }

  const json = await resp.json();
  const candidateParts =
    json.candidates?.[0]?.content?.parts ?? [];

  const imagePart = candidateParts.find(
    (p: Record<string, unknown>) => p.inlineData
  );
  const textPart = candidateParts.find(
    (p: Record<string, unknown>) => p.text
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error(
      `No image generated for variant ${variantIndex + 1}`
    );
  }

  const outMime = imagePart.inlineData.mimeType ?? "image/png";
  const imageBase64 = `data:${outMime};base64,${imagePart.inlineData.data}`;
  const description =
    (textPart?.text as string) ??
    `Variant ${variantIndex + 1} — "${thumbnailText}"`;

  return { imageBase64, description };
}

// ── Route Handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const {
      channelStyle,
      titleText,
      thumbnailText,
      guests,
      existingThumbnailUrls = [],
      generateCount = 3,
    } = await req.json();

    if (!channelStyle || !titleText) {
      return NextResponse.json(
        { error: "channelStyle and titleText are required" },
        { status: 400 }
      );
    }

    const count = Math.min(generateCount, 3);

    // Normalize guests list
    let guestList: GuestInput[] = [];
    if (Array.isArray(guests) && guests.length > 0) {
      guestList = guests.filter(
        (g: GuestInput) => (g.name ?? "").trim() || g.headshotBase64
      );
    }

    console.log(
      `[Thumbnail] Processing ${guestList.length} guest(s)…`
    );

    // Process all guests in parallel (headshot lookup + bg removal)
    const processedGuests =
      guestList.length > 0 ? await processGuests(guestList) : [];

    // Generate variant copy
    let copyVariants: string[];
    if (thumbnailText) {
      copyVariants = Array(count).fill(thumbnailText);
    } else {
      copyVariants = await generateVariantCopy(
        titleText,
        channelStyle,
        count
      );
    }

    // Generate thumbnails sequentially (rate limit friendly)
    const thumbnails: { imageUrl: string; description: string }[] = [];
    const refUrls: string[] = Array.isArray(existingThumbnailUrls)
      ? existingThumbnailUrls.slice(0, 5)
      : [];

    for (let i = 0; i < count; i++) {
      const result = await generateSingleThumbnail(
        channelStyle,
        titleText,
        copyVariants[i],
        i,
        processedGuests,
        refUrls
      );

      thumbnails.push({
        imageUrl: result.imageBase64,
        description: result.description,
      });

      console.log(`[Thumbnail] Variant ${i + 1} generated`);
    }

    return NextResponse.json({ thumbnails });
  } catch (error) {
    console.error("[Thumbnail] Error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("Rate limit") ? 429 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
