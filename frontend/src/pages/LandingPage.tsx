import React from 'react';
import { Navbar } from '../components/landing/Navbar';
import { Hero } from '../components/landing/Hero';
import { FeaturesGrid } from '../components/landing/FeaturesGrid';
import { HowItWorks } from '../components/landing/HowItWorks';
import { ReliabilityStrip } from '../components/landing/ReliabilityStrip';
import { CtaBand } from '../components/landing/CtaBand';
import { Footer } from '../components/landing/Footer';

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <FeaturesGrid />
        <HowItWorks />
        <ReliabilityStrip />
        <CtaBand />
      </main>
      <Footer />
    </div>
  );
};
