# 🎬 Clippi: AI-Powered Video Clipping Engine

**Clippi** is an advanced, AI-driven video editing and clipping platform. It combines modern web technologies with state-of-the-art machine learning models like **SAM2 (Segment Anything Model 2)** and **Mistral AI** to provide a seamless, chat-interactive video editing experience.

## 🚀 Overview

Clippi allows users to transform long-form video content into optimized clips. It features a robust backend for heavy-duty video processing and a high-performance frontend for real-time editing and visualization.

### Key Features

* **AI Segmentation:** Leverages SAM2 for precise object segmentation and tracking within videos.
* **Chat-Driven Editing:** Integrated with Mistral AI to allow users to interact with the engine via natural language.
* **Audio Enhancement:** Features dubbing, voiceovers (via ElevenLabs), and background music integration.
* **Interactive Editor:** A custom-built React editor featuring a node-based workflow (Xyflow) and Remotion-powered video previews.
* **Scalable Processing:** Designed to run heavy GPU workloads on Brev.dev (Nvidia A100/H100) while maintaining a lightweight local frontend.
* **Tool Call Observability:** Every MCP tool call is logged to Weights & Biases in real time, with session-scoped traces fed back to Mistral for hallucination detection and auditability.


## 🛠️ Tech Stack

### Backend

* **Framework:** FastAPI
* **AI Models:** SAM2 (Meta AI), Mistral AI
* **Video/Audio Processing:** FFmpeg, MoviePy, OpenCV
* **Voice Synthesis:** ElevenLabs
* **Observability:** Weights & Biases (WandB)

### Frontend

* **Core:** React (Vite)
* **Styling:** Tailwind CSS
* **Video Engine:** Remotion
* **State Management:** Zustand
* **Interactive UI:** Xyflow/React (Nodes), Framer Motion (Animations), Lucide React (Icons)


## 📁 Project Structure

```text
Clippi/
├── backend/                # FastAPI Application
│   ├── app/
│   │   ├── audio/          # Voiceover, Dubbing, Music services
│   │   ├── routers/        # API Endpoints (Clips, Chat, Jobs, etc.)
│   │   └── services/       # Core logic (Mistral, Video services)
│   ├── object optimizer/   # SAM2 integration and segmentation logic
│   ├── requirements.txt    # Python dependencies
│   └── main.py             # API Entry point
├── frontend/               # React Application
│   ├── src/
│   │   ├── components/     # UI Components (Editor, Canvas, Chat)
│   │   ├── pages/          # Landing and Editor pages
│   │   └── store/          # Zustand state management
│   └── package.json        # Frontend dependencies
├── setup.sh                # Unified setup script
└── run_server_on_brev.sh   # Deployment script for GPU instances

```

## 📊 Observability & Tool Verification (W&B)

Clippi uses **Weights & Biases** as the backbone for MCP tool call tracing and Mistral hallucination prevention.

### MCP Tool Call Logging

Every tool call dispatched through MCP is automatically intercepted and logged to a W&B run before execution. Each log entry captures:

* **Tool name** and **input arguments**
* **Timestamp** and **session/request ID**
* **Response payload** and **execution duration**
* **Status** (success, error, timeout)

```python
import wandb

def log_tool_call(tool_name: str, inputs: dict, response: dict, duration_ms: float):
    wandb.log({
        "mcp/tool_name": tool_name,
        "mcp/inputs": inputs,
        "mcp/response": response,
        "mcp/duration_ms": duration_ms,
        "mcp/status": "success" if response else "error",
    })
```

Logs are grouped per editing session under a dedicated W&B project (`clippi-mcp-traces`), making it easy to replay, filter, and audit every tool invocation across sessions.

### Mistral Tool Hallucination Prevention

Before Mistral's response is acted upon, the tool names it claims to have called are cross-validated against the W&B run logs for that session. This prevents the model from hallucinating tool calls that never actually occurred.

```python
def verify_tool_calls(session_id: str, claimed_tools: list[str]) -> bool:
    # Pull logged tool names from W&B for this session
    run = wandb.Api().run(f"clippi-mcp-traces/{session_id}")
    logged_tools = {row["mcp/tool_name"] for row in run.history()}

    unverified = [t for t in claimed_tools if t not in logged_tools]
    if unverified:
        wandb.log({"verification/hallucinated_tools": unverified})
        return False
    return True
```

If any claimed tool is not found in the W&B logs, the response is flagged, the hallucinated tool names are themselves logged back to W&B for tracking, and Mistral is re-prompted to correct its output.

This closed feedback loop -- **MCP executes → W&B logs → Mistral verifies** -- ensures that every action Clippi takes is grounded in what actually ran.

## ⚙️ Installation & Setup

The project includes a unified `setup.sh` script to automate the installation of both frontend and backend environments.

### 1. Prerequisites

* Node.js & npm
* Python 3.8+
* FFmpeg

### 2. Run Automatic Setup

```bash
chmod +x setup.sh
./setup.sh

```

**This script will:**

* Install frontend dependencies via npm.
* Create a Python virtual environment and install backend requirements.
* **Install SAM2** and download the `sam2.1_hiera_large.pt` checkpoint (~900MB).
* Generate a template `.env` file.

### 3. Environment Variables

Create or edit `backend/.env` with your API keys:

```env
ELEVENLABS_API_KEY=your_key_here
MISTRAL_API_KEY=your_key_here
WANDB_API_KEY=your_key_here

```


## 🏃 Running the Application

### Local Development (Frontend)

```bash
cd frontend
npm run dev

```

The frontend will be available at `http://localhost:5173`.

### Backend (GPU Instance)

Clippi is optimized for remote GPU execution. To run the backend on a Brev instance named `clippi-sam-2`:

```bash
./run_server_on_brev.sh

```

## 🛰️ API Endpoints

The backend exposes several modular routers under the `/api` prefix:

| Endpoint | Description |
| --- | --- |
| `GET /` | Health check & Version (v0.3.0) |
| `/api/health` | Service status monitoring |
| `/api/clips` | Video clip management |
| `/api/chat` | Mistral-powered AI editing chat |
| `/api/audio` | Voiceover and sound effects processing |
| `/api/jobs` | Long-running task/background job status |
| `/api/export` | Final video rendering and export |


---

**Built with ❤️ for the future of video** 🎬 <br>
*By: Sherwin Vishesh Jathanna, Divyam Kataria, Alexander Schor* <br>
*Clippi - Edit smarter. Create faster. Go viral.* <br>
*#Vibe-Editing*