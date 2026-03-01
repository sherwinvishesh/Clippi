# 🎬 Clippi: AI-Powered Video Clipping Engine

**Clippi** is an advanced, AI-driven video editing and clipping platform. It combines modern web technologies with state-of-the-art machine learning models like **SAM2 (Segment Anything Model 2)** and **Mistral AI** to provide a seamless, chat-interactive video editing experience.

---

## 🚀 Overview

Clippi allows users to transform long-form video content into optimized clips. It features a robust backend for heavy-duty video processing and a high-performance frontend for real-time editing and visualization.

### Key Features

* **AI Segmentation:** Leverages SAM2 for precise object segmentation and tracking within videos.
* **Chat-Driven Editing:** Integrated with Mistral AI to allow users to interact with the engine via natural language.
* **Audio Enhancement:** Features dubbing, voiceovers (via ElevenLabs), and background music integration.
* **Interactive Editor:** A custom-built React editor featuring a node-based workflow (Xyflow) and Remotion-powered video previews.
* **Scalable Processing:** Designed to run heavy GPU workloads on Brev.dev (Nvidia A100/H100) while maintaining a lightweight local frontend.

---

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

---

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

---

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

---

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

---

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
