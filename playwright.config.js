import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',use:{baseURL:'http://localhost:3000',viewport:{width:1366,height:1000}},webServer:{command:'python -m http.server 3000',url:'http://localhost:3000',reuseExistingServer:true}});
