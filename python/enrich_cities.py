import pandas as pd
import json

# Load your 7k file
df = pd.read_csv("event_location_city_map.csv", dtype=str)

# Normalize arrondissement codes to parent commune
def normalize_city_id(code):
    if code.startswith("751"):
        return "75056"  # Paris
    if code.startswith("132"):
        return "13055"  # Marseille
    if code.startswith("6938"):
        return "69123"  # Lyon
    return code

df["city_id"] = df["city_id"].apply(normalize_city_id)

# Load communes JSON (official source)
with open("communes_full.json", "r") as f:
    communes_data = json.load(f)

# Convert JSON to DataFrame
communes = pd.DataFrame([
    {
        "city_id": c["code"],
        "longitude": float(c["centre"]["coordinates"][0]),
        "latitude": float(c["centre"]["coordinates"][1])
    }
    for c in communes_data
    if c.get("centre") and c["centre"] is not None
])

# Merge by INSEE code
df = df.merge(communes, on="city_id", how="left")

# Build geo_point (WKT format: POINT(lon lat))
df["geo_point"] = df.apply(
    lambda row: f"POINT({row['longitude']} {row['latitude']})"
    if pd.notnull(row["latitude"]) else None,
    axis=1
)

# Save result
df.to_csv("event_location_city_map_enriched.csv", index=False)

print("Done.")