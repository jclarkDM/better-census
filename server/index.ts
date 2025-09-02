import { Census } from "../lib/census";

const server = await Census.startServer({ port: Number(process.env.BETTER_CENSUS_PORT) ?? 3000 });