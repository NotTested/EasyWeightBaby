// Avoid inheriting the container's machine HOSTNAME as the listening address.
process.env.HOSTNAME = process.env.APP_HOST ?? "0.0.0.0";
await import("../.next/standalone/server.js");
