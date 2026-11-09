// Refusal used by inert entrypoints. Importing this module does nothing.

export function refuseInertScript(name) {
  if (typeof name !== "string" || name.length === 0) {
    const invalid = new Error("inert script name is missing");
    invalid.code = "INERT_REFUSAL";
    throw invalid;
  }
  const error = new Error(
    `${name} is an inert stage-1 script. The Octava Acta forbids executing it.`,
  );
  error.code = "INERT_REFUSAL";
  throw error;
}
