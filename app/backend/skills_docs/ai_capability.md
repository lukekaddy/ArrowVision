# AI Capability

## Description
AI text, image, video, audio generation, single-PDF analysis, and speech transcription guidance. Covers frontend SDK `client.ai` usage (`gentxt` / `genimg` / `genvideo` / `genaudio`), backend `AIHubService` usage, and backend endpoint patterns for PDF/document tasks.

## Guide

### AI Capability (aihub module)

When the requirement involves AI features (text generation, image analysis, auto-reply, chat, etc.):

> Note: `scribe_v2` is the default speech recognition model in `multimodal.audio_transcription`. Use it for captions, transcripts, and subtitle source text. `client.ai` currently covers generation APIs only. For `transcribe` and `analyzepdf`, call the backend endpoints via `client.apiCall.invoke`, or use `AIHubService` directly in backend code.

#### Frontend - Use Web SDK `client.ai` (preferred)

**`client.ai.gentxt(params)`**
- Required: `messages`, `model`, `stream`
- `messages[].role`: `system` / `user` / `assistant`
- `messages[].content`:
  - Text: string
  - Multimodal: `[{ type: 'text', text: '...' }, { type: 'image_url', image_url: { url: 'https://...' | 'data:image/png;base64,...' } }]`
- Streaming callbacks (when `stream: true`): `onChunk`, `onComplete`, `onError`
- Default: when calling via SDK `client.ai.gentxt`, use `stream: true` unless explicitly required otherwise
- Avoid custom backend wrapper endpoints for aihub unless necessary; if you must call a custom endpoint via `client.apiCall.invoke`, default to NON-streaming (return full content) to avoid fragile stream parsing

```typescript
// Streaming (recommended)
const result = await client.ai.gentxt({
  messages: [...],
  model: 'deepseek-v3.2',
  stream: true,
  onChunk: (chunk) => {/* chunk.content */},
  onComplete: (finalResult) => {/* finalResult.content */},
  onError: (error) => {/* error.message */},
  timeout: 60_000,
});

// Non-streaming
const response = await client.ai.gentxt({ messages: [...], model: 'deepseek-v3.2', stream: false });
const text = response.data.content;
```

**`client.ai.genimg(params, options?)`**
- Required: `prompt`, `model`
- Optional: `size` (default `"1024x1024"`), `quality` (default `"standard"`, ignored for img2img), `n` (default `1`)
- `image` (img2img): Base64 Data URI string OR list of Base64 Data URI strings (multi-image); HTTP URL NOT allowed
  - Examples: `[subject, background]` (bg replace), `[person, clothing]` (try-on), `[content, style_ref]` (style transfer)
- Timeout: genimg may be slow; set longer timeout (e.g., `600_000` ms)
- Response: `response.data.images[0]` is URL (preferred) or base64 Data URI
- One-step-first: if one `genimg` call can solve it, do NOT split into multiple endpoints/steps; only split when quality/controllability requires it, and show progress

```typescript
const img = await client.ai.genimg(
  { prompt: 'cat', model: 'gemini-2.5-flash-image', size: '1024x1024', quality: 'standard', n: 1 },
  { timeout: 600_000 }
);
const edited = await client.ai.genimg(
  { prompt: '...', model: 'gemini-3-pro-image-preview', image: 'data:image/png;base64,...' },
  { timeout: 600_000 }
);
```

**`client.ai.genvideo(params, options?)`**
- Required: `prompt`, `model`
- Optional: `size` (default `"1280x720"`, do NOT change), `seconds` (default `"4"`, do NOT change)
- `image` (image-to-video): Base64 Data URI string as the first frame reference
- Timeout: video generation is slow; set longer timeout (e.g., `600_000` ms or more)
- Response: `response.data.url` is the CDN URL of the generated video
- Note: Video generation is async - the API polls internally until completion

```typescript
// Text-to-Video
const video = await client.ai.genvideo(
  { prompt: 'Ocean waves at sunset', model: 'wan2.6-t2v' },
  { timeout: 600_000 }
);
const videoUrl = video.data.url;

// Image-to-Video (use image as first frame)
const videoFromImage = await client.ai.genvideo(
  { prompt: 'Animate the scene', model: 'wan2.6-i2v', image: 'data:image/png;base64,...' },
  { timeout: 600_000 }
);
```

**`client.ai.genaudio(params, options?)`**
- Required: `text`, `model`
- Optional: `gender` (default `"female"`, options: `"male"` | `"female"`)
- Voice is auto-selected based on model and gender (no manual voice selection needed)
- Response: `response.data.url` is the CDN URL of the generated audio (mp3)

```typescript
const audio = await client.ai.genaudio(
  { text: 'Welcome to our website', model: 'eleven_v3', gender: 'female' },
  { timeout: 600_000 }
);
const audioUrl = audio.data.url;

// Male voice
const maleAudio = await client.ai.genaudio(
  { text: 'Product introduction', model: 'eleven_v3', gender: 'male' },
  { timeout: 600_000 }
);
```

**Speech transcription via backend endpoint**
- `client.ai` currently has no dedicated transcription helper; call `/api/v1/aihub/transcribe` with `client.apiCall.invoke`
- Required: `audio`
- Optional: `model` (default `scribe_v2`)
- `audio` supports HTTP URL, base64 data URI, or backend absolute path
- Response: `response.data.text` is the transcript
- `/api/v1/aihub/transcribe` is a JSON-only endpoint. Do NOT send `FormData`, `UploadFile`, or `multipart/form-data` to it.
- If the source is a browser `File`/`Blob`, either convert it to a base64 data URI on the frontend and send JSON to `/api/v1/aihub/transcribe`, or create a custom backend wrapper route that accepts `UploadFile`, then converts the uploaded file and calls `AIHubService.transcribe(...)` internally.
- If you create such a wrapper route for business needs like auth, DB persistence, or extra fields such as `source_type`, the frontend must call that custom route instead of calling `/api/v1/aihub/transcribe` directly.

```typescript
const transcript = await client.apiCall.invoke({
  url: '/api/v1/aihub/transcribe',
  method: 'POST',
  data: {
    audio: 'https://cdn.example.com/interview.mp3',
    model: 'scribe_v2',
  },
});
const text = transcript.data.text;
```

```typescript
// Browser File/Blob -> base64 data URI -> JSON request
const fileToDataUri = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const audioDataUri = await fileToDataUri(file);
const transcript = await client.apiCall.invoke({
  url: '/api/v1/aihub/transcribe',
  method: 'POST',
  data: {
    audio: audioDataUri,
    model: 'scribe_v2',
  },
});
```

**Single PDF analysis via backend endpoint**
- Call `/api/v1/aihub/analyzepdf` with `client.apiCall.invoke`
- Required: `pdf`, `instruction`
- Optional: `mode` (`qa` or `extract`), `page_start`, `page_end`
- `pdf` must be a base64 PDF data URI
- Timeout: PDF analysis may be slow; set request timeout to `600_000` ms (10 minutes)
- Single PDF only; the backend selects the PDF analysis model internally
- Response: `response.data.result` contains the answer or extracted Markdown

```typescript
const fileToDataUri = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const pdfDataUri = await fileToDataUri(file);
const pdfAnalysis = await client.apiCall.invoke({
  url: '/api/v1/aihub/analyzepdf',
  method: 'POST',
  data: {
    pdf: pdfDataUri,
    instruction: 'Summarize the top business risks in Chinese.',
    mode: 'extract',
    page_start: 1,
    page_end: 20,
  },
  options: {
    timeout: 600_000,
  },
});
const analysisText = pdfAnalysis.data.result;
```


#### Error Handling (Frontend)

```typescript
// IMPORTANT: UI toast requires <Toaster /> mounted in App
const getErrorDetail = (error: any) =>
  error?.data?.detail || error?.response?.data?.detail || error?.message || '请求失败';

// Non-streaming
try { /* await client.ai.gentxt({ ..., stream: false }) */ }
catch (e: any) { /* toast(getErrorDetail(e)) */ }

// Streaming
await client.ai.gentxt({ ..., stream: true, onError: (e) => {/* toast(getErrorDetail(e)) */} });
```

#### Backend - Import AIHubService directly (NOT via httpx/requests)

```python
from services.aihub import AIHubService
from schemas.aihub import GenTxtRequest, ChatMessage

service = AIHubService()
request = GenTxtRequest(
    messages=[
        ChatMessage(role="system", content="You are a summarization expert"),
        ChatMessage(role="user", content=text)
    ],
    model="deepseek-v3.2"
)

# Streaming (DEFAULT / recommended) - gentxt_stream yields plain text chunks directly
async for chunk in service.gentxt_stream(request):
    yield chunk  # chunk is plain text string

# Non-streaming (ONLY when you explicitly need a single complete payload)
response = await service.gentxt(request)
result = response.content  # string
```

**Video Generation (Backend)**
```python
from services.aihub import AIHubService
from schemas.aihub import GenVideoRequest

service = AIHubService()

# Text-to-Video
request = GenVideoRequest(
    prompt="Ocean waves at sunset",
    model="wan2.6-t2v"
    # size and seconds have safe defaults, do NOT change unless necessary
)
response = await service.genvideo(request)
video_url = response.url  # CDN URL

# Image-to-Video (use base64 data URI as first frame)
request = GenVideoRequest(
    prompt="Animate the scene",
    model="wan2.6-i2v",
    image="data:image/png;base64,..."  # or HTTP URL
)
response = await service.genvideo(request)
```

**Audio Generation (Backend)**
```python
from services.aihub import AIHubService
from schemas.aihub import GenAudioRequest

service = AIHubService()

# TTS with gender-based voice selection
request = GenAudioRequest(
    text="Welcome to our website",
    model="eleven_v3",
    gender="female"  # voice is auto-selected based on model and gender
)
response = await service.genaudio(request)
audio_url = response.url  # CDN URL
voice_used = response.voice  # actual voice name used
```

**Speech Transcription (Backend)**
```python
from services.aihub import AIHubService
from schemas.aihub import TranscribeAudioRequest

service = AIHubService()

request = TranscribeAudioRequest(
    audio="https://cdn.example.com/interview.mp3",
    model="scribe_v2",
)
response = await service.transcribe(request)
transcript_text = response.text
```

**Single PDF Analysis (Backend)**
```python
from services.aihub import AIHubService
from schemas.aihub import AnalyzePdfRequest

service = AIHubService()

request = AnalyzePdfRequest(
    pdf="data:application/pdf;base64,...",
    instruction="Summarize the main risks in Chinese.",
    mode="extract",
    page_start=1,
    page_end=20,
)
response = await service.analyze_pdf(request)
analysis_text = response.result
```
