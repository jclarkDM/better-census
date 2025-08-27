import { Census } from "../lib/census";

const server = await Census.startServer({ port: Number(process.env.PORT) ?? 3000 });