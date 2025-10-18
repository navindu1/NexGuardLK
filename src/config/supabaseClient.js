// File Path: src/config/supabaseClient.js


console.log("SUCCESS: supabaseClient.js file is starting to load.");

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

module.exports = supabase;