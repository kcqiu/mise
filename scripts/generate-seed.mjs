import { readFile, writeFile } from "node:fs/promises";

const source = new URL("../src/recipes/data/recipes.json", import.meta.url);
const destination = new URL("../supabase/seed.sql", import.meta.url);
const recipes = JSON.parse(await readFile(source, "utf8"));
const json = JSON.stringify(recipes, null, 2);
const sql = `-- Generated from src/recipes/data/recipes.json.
-- Re-run npm run seed:generate after changing the system collection.
insert into public.recipes (id, owner_id, is_system, payload)
select item ->> 'id', null, true, item
from jsonb_array_elements($mise_recipes$${json}$mise_recipes$::jsonb)
  as system_recipe(item)
on conflict (id) do update
set payload = excluded.payload,
    is_system = true,
    owner_id = null,
    updated_at = now();
`;

await writeFile(destination, sql);
console.log(`Generated ${recipes.length} system recipes in supabase/seed.sql`);
