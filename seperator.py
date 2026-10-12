import pandas as pd

df = pd.read_csv("ubereats_restaurants.csv")

df[["Latitude", "Longitude"]] = df["coordinates"].str.split(",", expand=True)

df.to_csv("ubereats_restaurants.csv", index=False)

print(df)