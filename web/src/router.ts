import { createRouter, createWebHistory } from 'vue-router';
import { staffSession } from './lib/staffSession';

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', component: () => import('./views/citizen/HomeView.vue') },
    { path: '/profile', component: () => import('./views/citizen/ProfileView.vue') },
    { path: '/matches', component: () => import('./views/citizen/MatchesView.vue') },
    { path: '/resource/:id', component: () => import('./views/citizen/ResourceView.vue'), props: true },
    { path: '/request', component: () => import('./views/citizen/RequestView.vue') },
    { path: '/my', component: () => import('./views/citizen/MyCasesView.vue') },
    { path: '/family', component: () => import('./views/citizen/FamilyView.vue') },
    { path: '/family/elder/:id', component: () => import('./views/citizen/ElderView.vue'), props: true },
    { path: '/staff/login', component: () => import('./views/staff/LoginView.vue') },
    {
      path: '/staff',
      component: () => import('./views/staff/StaffShell.vue'),
      meta: { staff: true },
      children: [
        { path: '', component: () => import('./views/staff/CasesView.vue') },
        { path: 'radar', component: () => import('./views/staff/RadarView.vue') },
        { path: 'case/:id', component: () => import('./views/staff/CaseDetailView.vue'), props: true },
        { path: 'intake', component: () => import('./views/staff/IntakeView.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach((to) => {
  if (to.meta.staff && !staffSession.token) return { path: '/staff/login', query: { next: to.fullPath } };
});
