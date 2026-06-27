# Ghanneli AI Backend — GPU inference image
#
# BUILD ON THE L40S (not on the dev machine — no GPU/Docker there):
#   docker build -t ghanneli-aibackend .
#
# Run (GPU serving wires AceStepEngine + GpuEnginePool via env config,
# implemented in a later task):
#   docker run --gpus all -p 8000:8000 ghanneli-aibackend

# CUDA 12.4.1 + cuDNN runtime — matches L40S driver capabilities.
# Use the devel image if you later need to compile CUDA extensions.
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

# Prevent interactive prompts during apt installs
ENV DEBIAN_FRONTEND=noninteractive

# Install Python 3.11 + build essentials
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.11 \
        python3.11-dev \
        python3.11-venv \
        python3-pip \
        git \
        ffmpeg \
        libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Make python3.11 the default python / pip
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1 \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 \
    && python -m pip install --upgrade pip

WORKDIR /app

# Copy the ai-backend package (pyproject.toml, app/, tests/)
COPY . /app/

# Install the package in editable mode (fastapi, uvicorn, pydantic)
RUN pip install --no-cache-dir -e .

# Install PyTorch with CUDA 12.4 support
# Pin to a tested version; bump when upgrading the L40S driver stack.
RUN pip install --no-cache-dir \
    torch==2.3.1+cu124 \
    torchaudio==2.3.1+cu124 \
    --extra-index-url https://download.pytorch.org/whl/cu124

# Install ACE-Step
# TODO(L40S): replace with the stable pip package once published on PyPI;
# until then build from the canonical GitHub source.
RUN pip install --no-cache-dir \
    "git+https://github.com/ace-step/ACE-Step.git#egg=acestep"

EXPOSE 8000

# NOTE: The real engine is wired in via the ENGINE_TYPE env var (Task 2.x).
# Until that config task lands, this CMD runs the server without a real engine
# (it will fail at startup if no engine is provided — that's expected during dev).
CMD ["uvicorn", "app.serving.server:app", "--host", "0.0.0.0", "--port", "8000"]
