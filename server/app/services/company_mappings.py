import os
import json
from typing import Dict, List

MAPPING_DIR = "company_mappings"
os.makedirs(MAPPING_DIR, exist_ok=True)

def get_all_companies() -> List[Dict]:
    files = [f for f in os.listdir(MAPPING_DIR) if f.endswith(".json")]
    companies = []
    for fname in files:
        with open(os.path.join(MAPPING_DIR, fname)) as f:
            data = json.load(f)
            companies.append({"id": fname.replace(".json", ""), "name": data.get("name", "")})
    return companies

def save_company(name: str) -> str:
    cid = name.lower().replace(" ", "_")
    path = os.path.join(MAPPING_DIR, f"{cid}.json")
    if not os.path.exists(path):
        with open(path, "w") as f:
            json.dump({"name": name, "mapping": {}}, f)
    return cid

def get_mapping(company_id: str) -> Dict:
    path = os.path.join(MAPPING_DIR, f"{company_id}.json")
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        data = json.load(f)
    return data.get("mapping", {})

def save_mapping(company_id: str, mapping: Dict):
    path = os.path.join(MAPPING_DIR, f"{company_id}.json")
    data = {}
    if os.path.exists(path):
        with open(path) as f:
            data = json.load(f)
    data["mapping"] = mapping
    with open(path, "w") as f:
        json.dump(data, f)
