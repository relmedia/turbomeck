'use client';

import { AlignLeft } from 'lucide-react'
import React, { useState } from 'react'
import Sidebar from './Sidebar'

const MobileMenu = () => {
  const [isSidebarOpen,setIsSidebarOpen]=useState(false);
  return (
    <>
      <button onClick={()=>setIsSidebarOpen(!isSidebarOpen)}>
      <AlignLeft className='hover:text-darkColor hoverEffect lg:hidden me-2'/>
    </button>
    <div className='lg:hidden'>
      <Sidebar isOpen={isSidebarOpen} onClose={()=> setIsSidebarOpen(false)}/>
    </div>
    </>
  );
};

export default MobileMenu