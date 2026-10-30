# Maps long Synthea (LOINC) lab names to short canonical names.
# Order matters: the first matching rule wins.
RULES = [
    ("Microalbumin/Creatinine", "Microalbumin/Creatinine Ratio"),
    ("Glucose [Presence] in Urine", "Urine Glucose Presence"),
    ("Glucose [Mass/volume] in Urine", "Urine Glucose"),
    ("Carbon dioxide [Partial pressure]", "pCO2"),
    ("Hemoglobin A1c", "HbA1c"),
    ("Glomerular filtration rate", "eGFR"),
    ("Cholesterol in LDL", "LDL"),
    ("Cholesterol in HDL", "HDL"),
    ("Cholesterol", "Cholesterol"),
    ("Triglyceride", "Triglyceride"),
    ("Urea nitrogen", "BUN"),
    ("Creatinine", "Creatinine"),
    ("Carbon dioxide", "CO2"),
    ("Sodium", "Sodium"),
    ("Potassium", "Potassium"),
    ("Chloride", "Chloride"),
    ("Calcium", "Calcium"),
    ("Glucose", "Glucose"),
]


def normalize_test_name(name):
    """Return the short canonical name; unknown names are kept as they are."""
    if name is None:
        return None
    lowered = str(name).lower()
    for needle, canonical in RULES:
        if needle.lower() in lowered:
            return canonical
    return str(name).strip()


if __name__ == "__main__":
    samples = [
        "Hemoglobin A1c/Hemoglobin.total in Blood",
        "Glomerular filtration rate [Volume Rate/Area] in Serum or Plasma by Creatinine-based formula (MDRD)/1.73 sq M",
        "Urea nitrogen [Mass/volume] in Blood",
        "Urea nitrogen [Mass/volume] in Serum or Plasma",
        "Cholesterol in LDL [Mass/volume] in Serum or Plasma by Direct assay",
        "Cholesterol [Mass/volume] in Serum or Plasma",
        "Some Unknown Test",
    ]
    for s in samples:
        print(normalize_test_name(s), "<-", s[:50])