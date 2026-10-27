import os
import json
from pymongo import MongoClient
from datetime import datetime
from bson import ObjectId

# MongoDB 연결
MONGO_URI = "mongodb://diquest:ek2znptm2@localhost:27025"
DB_NAME = "datadrift_db"
DATA_DIR = "sample_data"

client = MongoClient(MONGO_URI)
db = client[DB_NAME]

def to_description(file_name):
    return f"{file_name.replace('_', ' ').replace('.json', '').capitalize()} 데이터셋"

# sample_data 디렉토리 내 JSON 파일 순회
for filename in os.listdir(DATA_DIR):
    if filename.endswith(".json") and filename != "load_all_datasets_to_mongo.py":
        file_path = os.path.join(DATA_DIR, filename)
        dataset_name = filename.replace(".json", "")
        dataset_description = to_description(filename)

        print(f"\n📥 업로드 중: {filename}")

        with open(file_path, encoding="utf-8") as f:
            records = json.load(f)

        if not records:
            print("⚠️ 데이터가 비어 있어 건너뜁니다.")
            continue

        # 1. 메타데이터 저장
        dataset_doc = {
            "name": dataset_name,
            "description": dataset_description,
            "num_samples": len(records),
            "num_features": len(records[0]) - 1,
            "labels": ["churned"] if "churned" in records[0] else [],  # 자동 추론 예시
            "type": "json",
            "uploaded_by": "yjkim",
            "created_at": datetime.now()
        }
        dataset_id = db.datasets.insert_one(dataset_doc).inserted_id

        # 2. 데이터 저장
        db.dataset_chunks.insert_one({
            "dataset_id": dataset_id,
            "records": records,
            "chunk_index": 1
        })

        print(f"✅ {dataset_name} 업로드 완료 (샘플 수: {len(records)})")
