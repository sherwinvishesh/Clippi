#!/bin/bash

# Ensure arguments are provided
if [ "$#" -eq 0 ]; then
    echo "Usage: ./run_on_brev.sh <python_script> [args...]"
    echo 'Example: ./run_on_brev.sh effects/object_effects.py test_clips/sample2.mp4 recolor "shirt" blue'
    exit 1
fi

echo "🚀 Syncing local code to clippi-sam-2..."
rsync -avz --exclude 'venv' --exclude '.git' --exclude '__pycache__' --exclude 'checkpoints' --exclude 'sam2' ./ clippi-sam-2:~/clippi-backend/ > /dev/null

echo "☁️  Running job on the A100 GPU..."
ssh clippi-sam-2 "cd ~/clippi-backend && source venv/bin/activate && python $@"
STATUS=$?

if [ $STATUS -ne 0 ]; then
    echo "❌ Job failed on the remote server. Stopping sync."
    exit $STATUS
fi

echo "📥 Downloading results to local Mac..."
rsync -avz clippi-sam-2:~/clippi-backend/outputs/ ./outputs/ > /dev/null

# Open the most recently modified MP4 file in the outputs folder
LATEST_MP4=$(ls -t outputs/*.mp4 2>/dev/null | head -n 1)

if [[ "$OSTYPE" == "darwin"* ]] && [ -n "$LATEST_MP4" ]; then
    echo "🎬 Opening $LATEST_MP4..."
    open "$LATEST_MP4"
fi
