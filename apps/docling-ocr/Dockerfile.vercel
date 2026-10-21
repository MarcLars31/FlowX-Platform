FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HUB_DISABLE_TELEMETRY=1 \
    HF_HOME=/models/huggingface DOCLING_ARTIFACTS_PATH=/models/docling HOST=0.0.0.0 PORT=8090
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 libgl1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt
COPY service.py .
RUN python service.py --warmup && useradd --system --uid 10001 scipx && chmod -R a+rX /models
ENV HF_HUB_OFFLINE=1
USER 10001
EXPOSE 8090
HEALTHCHECK --start-period=120s --interval=30s --timeout=5s \
    CMD python -c "import os,urllib.request; urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8090/healthz',headers={'Authorization':'Bearer '+os.environ['DOCLING_OCR_TOKEN']}),timeout=4)"
CMD ["python", "service.py"]
