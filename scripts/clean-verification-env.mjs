const COLOR_ENVIRONMENT_KEYS = new Set(["FORCE_COLOR", "NO_COLOR"]);

export function cleanVerificationEnv(environment = process.env) {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([name, value]) => !COLOR_ENVIRONMENT_KEYS.has(name) && value !== undefined,
    ),
  );
}
