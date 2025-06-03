export function getEnv(name: string, required = false) {
  const val = process.env[name]
  if (required && val == null) {
    throw new Error(
      `Cannot find environment variable ${name}. Make sure to set the option ${name.toLowerCase()}.`
    )
  } else {
    return val ?? ''
  }
}
