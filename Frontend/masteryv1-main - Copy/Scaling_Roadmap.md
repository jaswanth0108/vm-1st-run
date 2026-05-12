# System Capacity & Scaling Roadmap

This document provides a clear analysis of how many students your current website can support and the specific steps required to scale up to higher user counts without clashes or server issues.

## Current Capacity Analysis

Based on your current configuration (Node.js backend and PostgreSQL on Render), here is the breakdown of your system's "Safe Zone":

### 🎯 The Exact Figure: **100–150 Concurrent Users**
With your current setup, we estimate that **100 to 150 students** can comfortably write exams at the exact same time without experiencing significant lag or errors.

### Why this number?
1.  **Database Connections**: Your database pool is currently set to `10` concurrent connections. This means 10 complex queries can run at the exact same millisecond. Because Node.js is very fast at switching between tasks, these 10 connections can actually serve many more "active" users who are mostly reading or typing.
2.  **Memory Constraints**: On standard Free or Starter plans, the backend has limited RAM. If 500 students all try to download a 50-question exam with images at the exact same second, the server might run out of memory.
3.  **Frontend (Vite/Vercel)**: Your frontend is hosted on Vercel, which is globally distributed. This part can handle **millions** of users. The bottleneck is only the "talking" to the backend (saving answers).

---

## How to Increase Your Capacity

To support **1,000+ or 5,000+ students** simultaneously, follow this scaling walkthrough.

### Phase 1: Immediate Settings (Software Level)
*No cost, just code changes.*

1.  **Increase Database Pool**:
    - Update `Backend/college-exam-api/src/config/db.js`:
    ```javascript
    max: 50, // Increase from 10 to 50
    ```
    - *Note: Ensure your Render DB plan supports high connection counts.*

2.  **Optimize Autosave Frequency**:
    - If students save their code/answers every 5 seconds, it hits the DB too hard.
    - Set the autosave interval to **30 or 60 seconds** in `student/index.html`.

### Phase 2: Infrastructure Upgrade (Server Level)
*Requires upgrading your Render plan.*

1.  **Horizontal Scaling (Web Service)**:
    - On Render, increase the **Instance Count** from 1 to 3 or 5.
    - This creates "clones" of your server to share the load.
2.  **Vertical Scaling (Database)**:
    - Upgrade the PostgreSQL instance to a plan with more RAM and higher connection limits.

### Phase 3: Performance Features (Architecture Level)
*For 10,000+ users.*

1.  **Add Redis Caching**:
    - Store exam questions in a "Cache" (like Redis).
    - This prevents the server from asking the database for the same questions over and over again.
2.  **Database Indexing**:
    - Ensure all search fields (like `exam_id` in the `questions` table) have **Indexes**. I have already implemented basic indexing, but more can be added as data grows.

---

## 🚀 Recommended Immediate Actions
If you expect an exam with **500+ students** tomorrow:
1.  **Upgrade Render Web Service**: Move to a "Starter" or "Pro" plan (not Free).
2.  **Increase DB Pool**: I can set your `db.js` max connections to 30 right now if you wish.
3.  **Staggered Start**: Ask different branches (e.g., CSE at 10:00, ECE at 10:05) to log in. This prevents the "Login Spike" that crashes systems.

**Would you like me to increase your database pool size to 30 right now to give you an immediate boost?**
