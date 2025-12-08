import { Router } from "express";
import prisma from "../lib/prisma";
import { readFileSync } from "fs";
import path from "path";

const router = Router();

router.get("/cities", async (req, res, next) => {
  try {
    const locations = readFileSync(
      path.resolve("./src/data/locations.json"),
      "utf-8"
    );
    const locationsData = JSON.parse(locations);
    return res.json({
      success: true,
      data: locationsData.map((e: any) => e.name),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to get cities",
    });
  }
});

router.get("/cities/:city/counties", async (req, res, next) => {
  try {
    const { city } = req.params;
    const locations = readFileSync(
      path.resolve("./src/data/locations.json"),
      "utf-8"
    );
    const locationsData = JSON.parse(locations);
    // Türkçe karakterleri eşleyecek şekilde normalize et ve karşılaştır
    function normalizeTr(str: string) {
      return str
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    }
    const cityNormalized = normalizeTr(city);
    const cityData = locationsData.find((e: any) => normalizeTr(e.name) === cityNormalized);
    if (!cityData) {
      return res.status(404).json({
        success: false,
        message: "City not found",
      });
    }
    return res.json({
      success: true,
      data: cityData.counties.map((e: any) => e.name),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to get counties",
    });
  }
});

export default router;
