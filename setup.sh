#!/bin/bash

# Define colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}🚀 Starting Setup for Clippi...${NC}"

# 1. Check for Node.js and npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed. Please install Node.js and npm first.${NC}"
    exit 1
fi

echo -e "${GREEN}📦 Setting up Frontend...${NC}"
cd frontend
npm install
cd ..

# 2. Check for Python 3
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ python3 is not installed. Please install Python 3.${NC}"
    exit 1
fi

echo -e "${GREEN}🐍 Setting up Backend (Local)...${NC}"
cd backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo -e "${CYAN}Virtual environment created.${NC}"
fi

source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo -e "${CYAN}Installing SAM2...${NC}"
pip install -q sam2

# Download SAM2 checkpoint
CKPT="object optimizer/checkpoints/sam2.1_hiera_large.pt"
if [ ! -f "$CKPT" ]; then
    echo -e "${YELLOW}Downloading SAM2 checkpoint (~900 MB)...${NC}"
    mkdir -p "$(dirname "$CKPT")"
    if command -v wget &> /dev/null; then
        wget -q --show-progress -O "$CKPT" "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt"
    else
        curl -# -L -o "$CKPT" "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt"
    fi
else
    echo -e "${GREEN}✅ SAM2 checkpoint already present.${NC}"
fi

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env file not found in backend/. Creating a template...${NC}"
    echo "ELEVENLABS_API_KEY=" > .env
    echo "MISTRAL_API_KEY=" >> .env
    echo "WANDB_API_KEY=" >> .env
    echo -e "${YELLOW}Please fill in the API keys in backend/.env${NC}"
fi
cd ..

# 3. Check for ffmpeg (Optional, for local processing)
if ! command -v ffmpeg &> /dev/null; then
    echo -e "${YELLOW}🎥 ffmpeg is not installed. If you are running video processing locally, you might need it.${NC}"
    if command -v brew &> /dev/null; then
        echo -e "${CYAN}Installing ffmpeg via Homebrew...${NC}"
        brew install ffmpeg
    else
        echo -e "${YELLOW}Please install ffmpeg manually.${NC}"
    fi
fi

# 4. Brev Setup Instructions
echo -e "${GREEN}☁️  Checking Brev (Nvidia GPU) Setup...${NC}"
echo -e "${CYAN}Testing SSH connection to 'clippi-sam-2' (Timeout: 5s)...${NC}"
if ssh -o BatchMode=yes -o ConnectTimeout=5 clippi-sam-2 exit 2>/dev/null; then
    echo -e "${GREEN}✅ Successfully connected to Brev instance 'clippi-sam-2'.${NC}"
else
    echo -e "${YELLOW}⚠️  Could not connect to 'clippi-sam-2'.${NC}"
    echo -e "If you haven't set up your Brev instance yet, please do so:"
    echo -e "  1. Create an instance named 'clippi-sam-2' on Brev.dev (Nvidia GPU like A100 recommended)"
    echo -e "  2. Run 'brev login' and 'brev refresh'"
    echo -e "  3. Ensure 'ssh clippi-sam-2' connects successfully"
    echo -e "Run scripts will automatically configure the remote environment once connected.${NC}"
fi

echo ""
echo -e "${GREEN}✨ Setup complete!✨${NC}"
echo -e "To start the application:"
echo -e "  1. Backend (on Brev): ./run_server_on_brev.sh"
echo -e "  2. Frontend (Local):  cd frontend && npm run dev"
