FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y libglib2.0-0 libgl1 && rm -rf /var/lib/apt/lists/*

# Copy from ai-service directory (Render root context) or fallback to current directory
COPY ai-service/requirements.txt* requirements.txt* ./
RUN pip install --no-cache-dir -r requirements.txt

COPY ai-service/main.py* main.py* ./

EXPOSE 8000
ENV PORT=8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
