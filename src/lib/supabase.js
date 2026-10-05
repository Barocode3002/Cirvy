// src/lib/supabase.js

import { createClient } from '@supabase/supabase-js'

const rawUrl =
  import.meta.env.VITE_SUPABASE_URL

if (!rawUrl) {
  throw new Error(
    'Missing VITE_SUPABASE_URL'
  )
}

const supabaseUrl =
  rawUrl.replace(
    /\/(rest|auth|storage|realtime)\/v\d+\/?$/,
    ''
  )

const supabaseKey =
  import.meta.env
    .VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env
    .VITE_SUPABASE_ANON_KEY

if (!supabaseKey) {
  throw new Error(
    'Missing Supabase publishable/anon key'
  )
}

export const supabase =
  createClient(
    supabaseUrl,
    supabaseKey
  )