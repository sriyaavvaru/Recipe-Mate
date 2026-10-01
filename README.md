# Kitchen Buddy — Next.js MVP

This is the current MVP architecture:

ANY RECIPE
→ Gemini multimodal understanding
→ normalized Recipe JSON
→ deterministic scaling/unit conversion
→ personalized recipe
→ cooking mode
→ ESP32-ready payload

## Requirements

- Node.js 20.9+
- npm
- A Gemini API key

Next.js currently requires Node.js 20.9 or later. See the official Next.js documentation.

## 1. Install Node.js

On macOS, install Node 20+ (Homebrew is convenient):

```bash
brew install node
node -v
npm -v
```

## 2. Install project dependencies

From this folder:

```bash
npm install
```

## 3. Add your Gemini API key

Create `.env.local`:

```bash
cp .env.example .env.local
```

Open `.env.local` and set:

```text
GEMINI_API_KEY=YOUR_KEY_HERE
```

## 4. Run

```bash
npm run dev
```

Open:

http://localhost:3000

## Current inputs

- pasted recipe text
- image
- PDF
- video upload
- public recipe URL
- public YouTube URL

## Important source-access behavior

A URL is not magic. Private/logged-in/social pages may not expose their underlying recipe media.

- Public YouTube URLs are sent to Gemini's video understanding path.
- Public recipe URLs use Gemini URL Context.
- Instagram and other social pages should use the URL path when accessible; if the page does not expose the actual recipe content, the fallback is screenshot/video/text upload.

## Conversion

The AI extracts the source recipe, but the application performs numerical scaling and common unit conversions deterministically.

Volume → weight conversions use an ingredient-density table and produce a warning if a safe density is unavailable.

## ESP32 integration

The frontend has a `Connect Now` panel and the server exposes:

```text
POST /api/device
```

with:

```json
{
  "ip": "192.168.1.42",
  "recipe": { "...": "hardware payload" }
}
```

Tomorrow, the ESP32 can expose:

```text
POST /recipe
```

and the app can send the finalized recipe directly over the local network.

## Future

- Supabase auth/saved recipes
- Instagram-specific content retrieval fallback
- audio/music
- device discovery
- MQTT
- recipe history
- richer recipe editing
