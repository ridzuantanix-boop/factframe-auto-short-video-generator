import React from "react";
import { createRoot } from "react-dom/client";
import { PawarnaGenerator } from "../src/components/PawarnaGenerator";
import "./base.css";
createRoot(document.getElementById("root")!).render(<React.StrictMode><PawarnaGenerator deployment="cloud"/></React.StrictMode>);
