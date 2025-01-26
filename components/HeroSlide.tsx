"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

interface Slide {
  image: string;
  title: string;
  description: string;
  buttonText: string;
  buttonLink: string;
}

const slides: Slide[] = [
  {
    image: "/turbo.webp?height=500&width=1200",
    title: "Vill du få ut mer från din bil?",
    description: "Vi har specialtillverkade turbon som passar just din bil",
    buttonText: "Shoppa nu!",
    buttonLink: "/category/turbo",
  },
  {
    image: "/turbo2.webp?height=500&width=1200",
    title: "Explore Our Latest Collection",
    description: "Find the perfect items to match your style and needs.",
    buttonText: "Get Started",
    buttonLink: "/get-started",
  },
  {
    image: "/turbo3.webp?height=500&width=1200",
    title: "Join Our Community",
    description:
      "Connect with like-minded individuals and share your experiences.",
    buttonText: "Get Started",
    buttonLink: "/get-started",
  },
];

const SLIDE_DURATION = 10; // in seconds

export default function HeroSlider() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [progress, setProgress] = useState(0);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
    setProgress(0);
  }, []);

  //  const prevSlide = useCallback(() => {
  //    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  //    setProgress(0);
  //  }, []);

  const goToSlide = useCallback((index: number) => {
    setCurrentSlide(index);
    setProgress(0);
  }, []);

  useEffect(() => {
    let animationFrameId: number;
    let startTime: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const newProgress = (elapsed / (SLIDE_DURATION * 1000)) * 100;

      if (newProgress >= 100) {
        nextSlide();
        startTime = timestamp;
      } else {
        setProgress(newProgress);
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrameId);
  }, [nextSlide]);

  return (
    <div className="relative min-h-[500px] overflow-hidden rounded-lg">
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={currentSlide}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0">
          <Image
            src={slides[currentSlide].image || "/volvo1.webp"}
            alt={slides[currentSlide].title}
            fill
            style={{ objectFit: "cover" }}
            className="brightness-50"
          />
          <div className="absolute inset-0 flex items-center">
            <div className="container mx-auto px-4 md:px-8 lg:px-16 min-h-[600px] flex items-center justify-center">
              <div className="max-w-lg w-full text-center">
                <motion.h2
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  className="text-3xl md:text-4xl font-bold mb-4 text-white">
                  {slides[currentSlide].title}
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4, duration: 0.5 }}
                  className="text-lg md:text-xl mb-6 text-white">
                  {slides[currentSlide].description}
                </motion.p>
                <motion.a
                  href={slides[currentSlide].buttonLink}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6, duration: 0.5 }}
                  className="inline-block bg-white text-black font-bold py-2 px-6 rounded-full hover:bg-opacity-90 transition-colors">
                  {slides[currentSlide].buttonText}
                </motion.a>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
      {/* <button
        onClick={prevSlide}
        className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white px-4 py-2 rounded-lg hover:bg-white hover:text-black hoverEffect"
        aria-label="Previous slide">
        &#10094;
      </button>
      <button
        onClick={nextSlide}
        className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white px-4 py-2 rounded-lg hover:bg-white hover:text-black hoverEffect"
        aria-label="Next slide">
        &#10095;
      </button> */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center space-x-4 px-4">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-white text-blak text-sm relative overflow-hidden"
            aria-label={`Go to slide ${index + 1}`}>
            <span className="z-10 flex items-center justify-center">
              {index === currentSlide ? (
                <span>
                  {Math.ceil(
                    SLIDE_DURATION - (progress / 100) * SLIDE_DURATION
                  )}
                </span>
              ) : (
                <span>{index + 1}</span>
              )}
            </span>
            {index === currentSlide && (
              <svg className="absolute inset-0 w-full h-full">
                <motion.circle
                  cx="50%"
                  cy="50%"
                  r="48%"
                  fill="none"
                  stroke="black"
                  strokeWidth="2"
                  strokeDasharray="0 100"
                  initial={{ strokeDasharray: "0 100" }}
                  animate={{
                    strokeDasharray: `${progress} 100`,
                  }}
                  transition={{
                    duration: 0,
                    ease: "linear",
                  }}
                />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
