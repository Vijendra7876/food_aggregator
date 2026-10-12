import pandas as pd
import re

# Load CSV
df = pd.read_csv("ubereats_restaurants.csv")


def normalize(text):
    if pd.isna(text):
        return ""

    text = str(text).lower()

    # Remove punctuation/commas
    text = re.sub(r'[^\w\s]', ' ', text)

    # Remove extra spaces
    text = re.sub(r'\s+', ' ', text).strip()

    return text

# Normalize selected columns
df["Restaurant Name"] = df["Restaurant Name"].apply(normalize)
# df["Name"] = df["Name"].apply(normalize)
df["Address"] = df["Address"].apply(normalize)
df["City"] = df["City"].apply(normalize)
# df["Latitude"] = df["Latitude"].apply(normalize)
# df["Longitude"] = df["Longitude"].apply(normalize)
df["Cuisine"] = df["Cuisine"].apply(normalize)
df["Rating"] = df["Cuisine"].apply(normalize)
# df["Number of Reviews"] = df["Number of Reviews"].apply(normalize)
df["Menu Items"] = df["Menu Items"].apply(normalize)
df["Price"] = df["Price"].apply(normalize)

# Save the result
df.to_csv("uber_restaurants_normalized.csv", index=False)
# df.to_csv("ubereats_restaurants_normalized.csv", index=False)
# df.to_csv("zomato_restaurants_normalized.csv", index=False)

print(df)