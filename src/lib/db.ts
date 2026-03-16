import postgres from "postgres";

// Conexão direta — usada apenas em Server Components e Server Actions
const sql = postgres(process.env.DATABASE_URL!, {
  ssl: false,
  max: 5,
  idle_timeout: 20,
});

export default sql;
