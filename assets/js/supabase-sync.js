/*
 * Shared Supabase client + offline-first sync engine.
 * Used by FoodRating.html and menu.html. Requires the supabase-js CDN script
 * to be loaded on the page before this file.
 *
 * How offline-first works:
 *  - Every write goes through saveOrQueue(). If we're online and the request
 *    succeeds, it's done. If we're offline or the request fails, the write is
 *    queued in localStorage (key: pendingSupabaseOps).
 *  - On page load, and whenever the browser fires the "online" event, the
 *    queue is flushed automatically (flushPendingOps).
 *  - Reads (cloudFetch*) try Supabase first and fall back to the caller's
 *    localStorage cache when offline or on error, so the app keeps working
 *    without a connection.
 */

const SUPABASE_URL = "https://kjrxmtwuwxrkqnvyezvs.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqcnhtdHd1d3hya3FudnllenZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNzM3MDMsImV4cCI6MjA5MDk0OTcwM30.sFNN6YfxDy-m16LNAVUte6id3JRoHstCXnoX6JxYByc";

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PENDING_OPS_KEY = "pendingSupabaseOps";
const syncStatusListeners = [];
let isFlushing = false;

function onSyncStatusChange(listener) {
  syncStatusListeners.push(listener);
}

function notifyStatus() {
  const status = { online: navigator.onLine, pending: getPendingOps().length, flushing: isFlushing };
  syncStatusListeners.forEach(fn => fn(status));
}

function getPendingOps() {
  return JSON.parse(localStorage.getItem(PENDING_OPS_KEY)) || [];
}

function setPendingOps(queue) {
  localStorage.setItem(PENDING_OPS_KEY, JSON.stringify(queue));
  notifyStatus();
}

function queueOp(op) {
  const queue = getPendingOps();
  queue.push(op);
  setPendingOps(queue);
}

async function runOp(op) {
  const table = sbClient.from(op.table);
  if (op.type === "insert") {
    const { error } = await table.insert(op.payload);
    if (error) throw error;
  } else if (op.type === "upsert") {
    const { error } = await table.upsert(op.payload, { onConflict: op.conflictKey });
    if (error) throw error;
  } else if (op.type === "delete") {
    const { error } = await table.delete().match(op.match);
    if (error) throw error;
  }
}

async function saveOrQueue(op) {
  if (!navigator.onLine) {
    queueOp(op);
    return false;
  }
  isFlushing = true;
  notifyStatus();
  try {
    await runOp(op);
    localStorage.removeItem("lastSupabaseError");
    isFlushing = false;
    notifyStatus();
    return true;
  } catch (err) {
    logSupabaseError(`write to "${op.table}" failed`, err);
    isFlushing = false;
    queueOp(op);
    return false;
  }
}

async function flushPendingOps() {
  if (!navigator.onLine || isFlushing) return;
  const queue = getPendingOps();
  if (!queue.length) return;

  isFlushing = true;
  notifyStatus();

  const remaining = [];
  for (const op of queue) {
    try {
      await runOp(op);
    } catch (err) {
      logSupabaseError(`retry of queued write to "${op.table}" failed`, err);
      remaining.push(op);
    }
  }

  isFlushing = false;
  setPendingOps(remaining);
}

// Postgrest errors carry message/details/hint/code — log all of it, since
// "failed to fetch" (network/CORS) looks nothing like "relation does not
// exist" (schema not created) or "new row violates row-level security" (RLS).
// Also saved to localStorage so it can be inspected on a touchscreen kiosk
// with no keyboard/devtools access (see getLastSupabaseError()).
function logSupabaseError(context, err) {
  const details = {
    context,
    message: err && err.message,
    details: err && err.details,
    hint: err && err.hint,
    code: err && err.code,
    at: new Date().toISOString()
  };
  console.error(`Supabase ${context}:`, details);
  localStorage.setItem("lastSupabaseError", JSON.stringify(details));
}

function getLastSupabaseError() {
  return JSON.parse(localStorage.getItem("lastSupabaseError") || "null");
}

// Quick self-test you can run from the browser console (or a debug button) to
// confirm the URL/key/schema/RLS are all correctly set up. Does a real
// insert+delete round trip against `feedback`, since read access (RLS "select")
// can be fine while write access (RLS "insert") is separately misconfigured.
async function testSupabaseConnection() {
  let step = "read feedback";
  try {
    const { error: readError } = await sbClient.from("feedback").select("id").limit(1);
    if (readError) throw readError;

    step = "insert into feedback";
    const probeRow = {
      feedback_date: new Date().toISOString().split("T")[0],
      rating: 5,
      feedback_type: "rating_only"
    };
    const { data: inserted, error: insertError } = await sbClient
      .from("feedback")
      .insert(probeRow)
      .select("id")
      .single();
    if (insertError) throw insertError;

    step = "delete test row from feedback";
    const { error: deleteError } = await sbClient.from("feedback").delete().eq("id", inserted.id);
    if (deleteError) throw deleteError;

    console.log("Supabase connection OK: read + write to the feedback table both work.");
    return { ok: true };
  } catch (err) {
    logSupabaseError(`connection test failed at step "${step}"`, err);
    return { ok: false, step, error: err };
  }
}

window.addEventListener("online", flushPendingOps);
document.addEventListener("DOMContentLoaded", flushPendingOps);
// Retry queued writes periodically in case they failed for a reason other than
// being offline (e.g. a transient server error), without spinning forever.
setInterval(flushPendingOps, 30000);

// ---------- Feedback ----------
async function cloudSaveFeedback(rows) {
  return saveOrQueue({ table: "feedback", type: "insert", payload: rows });
}

async function cloudFetchFeedback() {
  try {
    if (!navigator.onLine) throw new Error("offline");
    const { data, error } = await sbClient
      .from("feedback")
      .select("*")
      .order("feedback_date", { ascending: false });
    if (error) throw error;
    return data;
  } catch (err) {
    return null;
  }
}

// ---------- Daily menu ----------
async function cloudUpsertDailyMenu(date, items, mealType = 'lunch') {
  return saveOrQueue({
    table: "daily_menu",
    type: "upsert",
    conflictKey: "menu_date,meal_type",
    payload: { menu_date: date, meal_type: mealType, items, updated_at: new Date().toISOString() }
  });
}

async function cloudFetchDailyMenu(date, mealType = 'lunch') {
  try {
    if (!navigator.onLine) throw new Error("offline");
    const { data, error } = await sbClient
      .from("daily_menu")
      .select("items")
      .eq("menu_date", date)
      .eq("meal_type", mealType)
      .maybeSingle();
    if (error) throw error;
    return data ? data.items : null;
  } catch (err) {
    return null;
  }
}

// ---------- Food items ----------
async function cloudUpsertFoodItem(name) {
  return saveOrQueue({
    table: "food_items",
    type: "upsert",
    conflictKey: "name",
    payload: { name }
  });
}

async function cloudDeleteFoodItem(name) {
  return saveOrQueue({ table: "food_items", type: "delete", match: { name } });
}

async function cloudFetchAllFoodItems() {
  try {
    if (!navigator.onLine) throw new Error("offline");
    const { data, error } = await sbClient.from("food_items").select("name").order("name");
    if (error) throw error;
    return data.map(row => row.name);
  } catch (err) {
    return null;
  }
}
