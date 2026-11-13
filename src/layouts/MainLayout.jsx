import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import Navbar from '../components/layout/Navbar';

export default function MainLayout() {
  return (
    <div className="atrium-layout">
      <Sidebar />
      <div className="atrium-main-wrapper">
        <Navbar />
        <main className="atrium-content-area" role="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
