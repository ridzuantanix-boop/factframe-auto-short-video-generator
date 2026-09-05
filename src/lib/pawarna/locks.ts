// Single source of truth for global generation rules. Both current and legacy adapters use these.
export const SPOKEN_CTA = "Klik link kat bawah.";
export const PAWARNA_VIDEO_EXECUTION_LOCK = `Create ONE finished approximately 10-second vertical 9:16 video. Begin immediately with actual moving scene footage. Uploaded reference images are visual ingredients only: never a first-frame still, still intro, slideshow, screenshot, app interface or fake video frame. Zero generated on-screen text: no subtitles, captions, prices, CTA graphics, random letters, text overlays or fake UI. Physical printed product labels remain unchanged.`;
export const ZERO_DECORATIVE_OVERLAY_LOCK = `ZERO DECORATIVE OVERLAY LOCK — HARD STYLE RULE. For every non-Doodle style, including Problem → Solution, POV Demo, Real-Life Use, Product Motion, Satisfying Demo, Close-Up Detail and Mini Commercial UGC, do not generate decorative graphics or editing overlays: no white sparkles, shine stars, floating icons, decorative particles, stickers, emojis, doodles, arrows, circles, checkmarks, animated graphics, generated visual callouts, fake UI, text overlays or promotional badges. Natural real-world light reflections are allowed; graphic sparkle/shine decorations are not. Output must look like clean raw real-world smartphone footage. EXCEPTION: only when the explicitly selected style is Doodle UGC, allow intentional minimal non-text doodle graphics; still no random text, fake UI or alien lettering.`;
export const PRODUCT_SET_IDENTITY_LOCK = `PRODUCT SET IDENTITY LOCK. If the uploaded reference represents a multi-piece product set, bundle, kit or collection, treat the complete set as the product identity. Preserve the approximate visually supported piece count, major included components, relative appearance, colour family, design consistency and meaningful visible accessories. Individual pieces may be used or demonstrated during the video; do not force every piece into every frame. When presenting or revealing the COMPLETE product or set, never silently reduce it to fewer pieces. Do not remove major pieces, invent additional pieces, duplicate pieces to fake quantity, replace pieces with different products or imply that a partial subset is the complete bundle. If showing the entire set naturally is impractical, continue demonstrating individual pieces instead of creating an inaccurate full-set reveal. Never invent an exact marketing quantity when visual evidence is uncertain. PRODUCT ACCURACY IS MORE IMPORTANT THAN FORCING A HERO SHOT.`;
export const PRODUCT_SCALE_LOCK = `REAL-WORLD PRODUCT SCALE LOCK — CRITICAL. Preserve believable physical size relative to human hands, fingers, forearms, face or body, furniture, kitchen counters, tables, shelves, bags and surrounding objects. Do NOT enlarge the product for visual emphasis. Never make a small handheld product oversized, giant, unusually wide, unusually tall, stretched, elongated or hero-sized. If naturally handheld, it must remain comfortably handheld. Estimate RELATIVE scale conservatively from the reference and known category; never invent exact centimetres or millilitres. When dimensions are unknown, prefer ordinary believable category size. PRODUCT REALISM IS MORE IMPORTANT THAN HERO PRESENCE. HAND SCALE REFERENCE: when held in one hand, grip must be physically possible, fingers wrap naturally, and the product must not exceed believable palm or hand proportions unless the reference clearly shows otherwise. Avoid a giant bottle, jar, box or gadget effect. Close-Up Detail may make the product large IN FRAME because the camera is close; large in frame does not mean physically oversized. Preserve true physical proportions in close-up shots.`;
export const REFERENCE_SANITIZATION_LOCK = `UPLOADED IMAGE ROLE — PRODUCT IDENTITY ONLY

PRODUCT IDENTITY REFERENCES ONLY.

The uploaded image is NOT the first frame of the video.
It is NOT a scene reference.
It is NOT a composition reference.
It is NOT a background reference.

Use it only to identify the physical product.

Preserve only:
- exact product identity
- shape
- proportions
- colours
- packaging
- genuine physical logo/label
- included physical accessories

Ignore everything else in the uploaded image.

Do NOT reproduce:
- original screenshot composition
- original background
- TikTok UI
- PayLater graphics
- installment banners
- shopping interface
- usernames
- captions
- social controls
- promotional graphics
- surrounding text
- phone UI

Create a completely NEW real-world scene from scratch.

The product physically exists inside that new scene.

Frame 1 must already be the NEW generated moving scene.

The uploaded image itself must never appear as a frame, background, overlay, poster or transition.

REFERENCE SANITIZATION — CRITICAL. PRODUCT IDENTITY is not REFERENCE COMPOSITION. Preserve genuine text physically printed on the product label. Never display the source reference image itself, including as a phone screen, floating image, picture-in-picture or slideshow. Ignore TikTok UI, Shopee UI and all social-media controls. UI text surrounding the product must disappear; genuine physical product-label text remains part of product identity. The very first rendered frame belongs to the new physical scene. No still-image intro, reference flash, fade from reference, screenshot transition or artificial camera whip.`;
export const PRODUCT_LOCK = `The uploaded PRODUCT photographs are the absolute visual source of truth. Preserve exact product shape, size, proportions, packaging, cap, bottle, label layout, logo/brand identity and visible colours. Never elongate bottles, widen packaging, invent logos, change colours, redesign labels, generate alternate packaging or oversize the product. Keep realistic physical scale relative to hands and surroundings. Do not reveal unseen surfaces or invent hidden product parts. Do not transform, replace or beautify the packaging. Books remain closed unless interior reference photographs were uploaded; never invent unseen pages, back cover, interiors or contents.`;
export const CAMERA_LOCK = `Use a believable flagship-smartphone camera with natural handheld micro-movement and small lateral/body movement when appropriate. Physically believable movement and gestures. No tripod feel, cinematic glide, aggressive zoom, artificial hero-spin or exaggerated influencer acting. POV styles may use genuine POV behaviour. No TV-commercial cinematic footage.`;
export const PAWARNA_VISUAL_MASTER_LOCK = `Realistic flagship-smartphone UGC footage: a good creator filming with a flagship smartphone in good light. Bright, clean, crisp and sharp; natural local contrast, clean whites, accurate product colour, realistic material texture and skin, natural dynamic range. Believable Malaysian everyday environment, no fixed ethnicity. Realistic motion blur only when physically appropriate. No grey wash, dull/kusam output, yellow/orange cinematic grading, moody darkness, dreamy softness, excessive bokeh, AI plastic skin, waxy skin, plastic-looking product, fake HDR or overprocessed commercial/studio look.`;
export const LANGUAGE_AUDIO_LOCK = `Speak only Bahasa Melayu Malaysia: Malaysian Malay only, conversational local language; do not drift into Indonesian or unnecessarily formal Malay. Full readable words, no invented claims or extra improvised sentences. Audible human Malay speech, natural delivery, clear foreground voice, no robotic TTS feeling or loud music competing with speech. Complete the supplied script exactly once. Realistic lip sync when a creator is visible. CTA is exactly "${SPOKEN_CTA}" Never change it to "Klik pautan." Do not rush or truncate the CTA; end naturally only after the spoken CTA is complete.`;
export const SILENT_AUDIO_LOCK = `VOICEOVER: OFF. No dialogue, speech, singing, lip movement suggesting speech or spoken CTA. No captions or generated text. Only quiet natural ambient sound. End naturally after the visual payoff.`;
export function globalPromptLocks(voice = true) {
  return ["PAWARNA_VIDEO_EXECUTION_LOCK: " + PAWARNA_VIDEO_EXECUTION_LOCK,
    "REFERENCE_SANITIZATION_LOCK: " + REFERENCE_SANITIZATION_LOCK,
    "ZERO_DECORATIVE_OVERLAY_LOCK: " + ZERO_DECORATIVE_OVERLAY_LOCK,
    "PRODUCT_SET_IDENTITY_LOCK: " + PRODUCT_SET_IDENTITY_LOCK,
    "PRODUCT_SCALE_LOCK: " + PRODUCT_SCALE_LOCK,
    "PAWARNA_VISUAL_MASTER_LOCK: " + PAWARNA_VISUAL_MASTER_LOCK,
    "PRODUCT_LOCK: " + PRODUCT_LOCK, "CAMERA_LOCK: " + CAMERA_LOCK,
    "LANGUAGE_AUDIO_LOCK: " + (voice ? LANGUAGE_AUDIO_LOCK : SILENT_AUDIO_LOCK)];
}
