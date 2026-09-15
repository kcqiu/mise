# Groceries Phase 3 Gameplan: Collaborative Family Shopping & Smart Kitchen

This document outlines the strategic roadmap, architecture, and feature specifications for **Phase 3** of the Groceries system in MISE.

---

## Pillar 1: Multi-Account Household Sharing & Cloud Collaboration

### Objective
Enable couples, families, and roommates to share a unified market bag across distinct Supabase user accounts without credential sharing.

### Core Architecture
1. **Household Entity (`households`)**:
   - `id`: `uuid primary key default gen_random_uuid()`
   - `name`: `text` (e.g. "The Smith Kitchen", "Apartment 4B")
   - `created_by`: `uuid references auth.users(id)`
   - `created_at`: `timestamptz default now()`
2. **Household Membership (`household_members`)**:
   - `household_id`: `uuid references households(id) on delete cascade`
   - `user_id`: `uuid references auth.users(id) on delete cascade`
   - `role`: `'owner' | 'member'`
   - `joined_at`: `timestamptz default now()`
   - `primary key (household_id, user_id)`
3. **Session Binding**:
   - `grocery_sessions.household_id`: nullable UUID reference.
   - When set, all members of the household share the single active session.
   - RLS policies on `grocery_sessions` and `realtime.messages` check membership via `household_members`.
4. **Invite Flow**:
   - Cryptographic invitation tokens generated via `crypto.randomUUID()` with 7-day expiration.
   - Deep-link onboarding: `mise.kecheng.dev/#/join-household?token=...`
   - Seamless one-tap acceptance for logged-in users.

---

## Pillar 2: Live In-Store Co-Shopping & Realtime Presence

### Objective
Allow multiple shoppers to split up across the grocery store (e.g., Partner A in Produce, Partner B in Dairy/Meat) and see real-time updates as items are checked off.

### Capabilities
1. **Realtime Checklist Broadcast**:
   - Immediate Supabase Realtime broadcast of `ITEM_STATUS_CHANGED` events.
   - Latency < 100ms under standard LTE/5G.
   - Checked item audio/haptic feedback on partner device (optional setting).
2. **Shopper Presence Avatars**:
   - Ephemeral presence via Supabase Realtime Presence channel.
   - Displays avatar chips at top of the Grocery screen (e.g., "Sarah is in Produce", "Alex is active").
3. **Split-Brain Safe Trip Completion**:
   - Server-side atomic transition with revision locking (`p_expected_revision`).
   - When one shopper finalizes the trip, the other shopper's screen receives an instant notification: *"Trip completed by Alex. Rolled over items are ready for your next trip."*

---

## Pillar 3: Kitchen Inventory & Smart Pantry Tracking

### Objective
Bridge the gap between meal planning and pantry reality by tracking what ingredients you already have at home.

### Capabilities
1. **Persistent Pantry Shelf**:
   - Three-state pantry inventory: `In Stock`, `Running Low`, `Out`.
   - Ingredients classified as `pantryStaples` automatically suggest their current pantry state.
2. **Automatic Depletion After Cooking**:
   - When a user finishes cooking a recipe in Mise (`RecipeDetail` step completion), prompt: *"Did you use up your Olive Oil or Soy Sauce?"*
   - One-tap addition directly to the next market bag.
3. **Barcode / Quick-Scan Audit (Camera Vision)**:
   - Use web camera / barcode scanning API to quickly audit pantry items before heading out to the supermarket.

---

## Pillar 4: Store Route Optimization & Predictive Aisle Clustering

### Objective
Minimize shopping time by sorting items according to the physical floor plan of the shopper's chosen store.

### Capabilities
1. **Store-Specific Presets**:
   - Layout presets customized for major supermarket formats (Trader Joe's, Costco, Whole Foods, Kroger, Asian Supermarkets).
2. **Predictive Department Heuristics**:
   - Offline heuristic classifier for ad-hoc custom items (e.g., "almond milk" auto-routes to Dairy/Plant Milk, "bagels" auto-routes to Bakery).
3. **Aisle Progress Tracking**:
   - Visual aisle completion indicator (turns green when all items in an aisle are checked off).

---

## Pillar 5: Native PWA & Kitchen Polish

### Objective
Deliver a 100% native-feeling mobile web application for kitchen and in-store use.

### Capabilities
1. **Service Worker Background Sync**:
   - Background mutation replay using native Background Sync API if connectivity drops in store basements.
2. **Web Share Target API**:
   - Receive recipes and shopping items shared directly from Instagram, TikTok, or Chrome into Mise.
3. **Push Notifications**:
   - "Don't forget the eggs! Sarah just added an item to your grocery list."
