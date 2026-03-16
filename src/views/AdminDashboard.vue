<template>
  <main class="admin-dashboard">
    <header class="admin-dashboard__header">
      <h1 class="admin-dashboard__title">Admin Dashboard</h1>
      <p class="admin-dashboard__subtitle">
        Restricted area. Only users with the <strong>admin</strong> role can access this page.
      </p>
    </header>

    <section class="admin-dashboard__content">
      <p>
        This is a placeholder for future admin tools and reports. If you can see this page, your account
        has been granted the <code>admin</code> role via the secure role system.
      </p>
    </section>
  </main>
</template>

<script setup lang="ts"></script>

<style scoped>
.admin-dashboard {
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.admin-dashboard__header {
  margin-bottom: 1.5rem;
}

.admin-dashboard__title {
  font-size: 1.75rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.admin-dashboard__subtitle {
  color: #4b5563;
  font-size: 0.95rem;
}

.admin-dashboard__content {
  padding: 1.5rem;
  border-radius: 0.75rem;
  border: 1px solid #e5e7eb;
  background-color: #f9fafb;
  font-size: 0.95rem;
  line-height: 1.5;
}
</style>

