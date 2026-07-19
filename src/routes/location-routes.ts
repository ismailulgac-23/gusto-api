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
    // Veritabanındaki kısa il adları ile resmî adlar arasındaki farklar.
    // (DB'de "Afyon" yazıyor, veri setinde "AFYONKARAHİSAR" geçiyor.)
    const ALIASES: Record<string, string> = {
      afyon: 'afyonkarahisar',
      urfa: 'sanliurfa',
      antep: 'gaziantep',
      maras: 'kahramanmaras',
      ice: 'mersin',
      icel: 'mersin',
    };

    const raw = normalizeTr(city);
    const cityNormalized = ALIASES[raw] ?? raw;

    let cityData = locationsData.find((e: any) => normalizeTr(e.name) === cityNormalized);

    // Tam eşleşme yoksa önek eşleşmesine düş ("Afyon" -> "Afyonkarahisar").
    if (!cityData) {
      cityData = locationsData.find(
        (e: any) =>
          normalizeTr(e.name).startsWith(cityNormalized) ||
          cityNormalized.startsWith(normalizeTr(e.name))
      );
    }
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
