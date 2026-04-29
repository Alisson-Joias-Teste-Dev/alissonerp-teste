"use client";
import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

export default function SwaggerPage() {
  return (
    <div className="p-4">
      <h1
        className="text-2xl font-bold mb-4"
        style={{ fontFamily: "var(--font-playfair)" }}
      >
        API Documentation
      </h1>
      <SwaggerUI url="/api/openapi.json" />
    </div>
  );
}
