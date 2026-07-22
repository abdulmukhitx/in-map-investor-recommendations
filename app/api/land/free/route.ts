type RawRecord = Record<string, unknown>;

type FreeLandRecord = {
  id: string;
  district: string;
  areaThousandHa: number | null;
  description: string;
};

const datasetId = "turkistan_oblysy_boiynsha_bos_";
const latestVersion = "v14";
const historicalVersion = "v11";
const sourceUrl = `https://data.egov.kz/datasets/view?index=${datasetId}`;

function firstArray(payload: unknown): RawRecord[] {
  if (Array.isArray(payload)) return payload.filter((item): item is RawRecord => Boolean(item) && typeof item === "object");
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["data", "items", "result", "records"]) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).filter((item): item is RawRecord => Boolean(item) && typeof item === "object");
  }
  return [];
}

function recordText(record: RawRecord) {
  return Object.values(record).filter((value): value is string => typeof value === "string").join(" ").toLocaleLowerCase("ru");
}

function latestDataLooksValid(records: RawRecord[]) {
  return records.some((record) => {
    const value = recordText(record);
    return /турк|түрк/.test(value) && /свобод|бос/.test(value);
  });
}

function parseArea(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(String(value).replace(",", ".").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeHistorical(records: RawRecord[]): FreeLandRecord[] {
  return records
    .map((record, index) => ({
      id: String(record.id ?? index + 1),
      district: typeof record.name4 === "string" ? record.name4.trim() : "",
      areaThousandHa: parseArea(record.name3),
      description: typeof record.name2 === "string" ? record.name2.trim() : "",
    }))
    .filter((record) => record.district)
    .sort((a, b) => (b.areaThousandHa ?? -1) - (a.areaThousandHa ?? -1));
}

async function fetchVersion(version: string, apiKey: string) {
  const endpoint = new URL(`https://data.egov.kz/api/v4/${datasetId}/${version}`);
  endpoint.searchParams.set("apiKey", apiKey);
  endpoint.searchParams.set("source", JSON.stringify({ size: 100 }));
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Open Data API returned ${response.status} for ${version}`);
  return firstArray(await response.json());
}

export async function GET() {
  const source = {
    title: "Free land in Turkistan Region",
    sourceUrl,
    api: `https://data.egov.kz/api/v4/${datasetId}/${latestVersion}`,
    latestVersion,
    limitation: "The official dataset contains aggregate text records without cadastral parcel polygons or coordinates.",
  };
  const apiKey = process.env.EGOV_API_KEY;
  if (!apiKey) {
    return Response.json(
      { records: [], meta: { ...source, status: "credentials_required" } },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const latestRecords = await fetchVersion(latestVersion, apiKey);
    const latestIsValid = latestDataLooksValid(latestRecords);

    if (latestIsValid) {
      return Response.json(
        {
          records: [],
          meta: {
            ...source,
            status: "connected_with_warning",
            version: latestVersion,
            historical: false,
            warning: {
              ru: "API подключён, но структура новой версии изменилась. До обновления адаптера записи не используются в оценке.",
              kk: "API қосылды, бірақ жаңа нұсқаның құрылымы өзгерген. Адаптер жаңартылғанша жазбалар бағалауда қолданылмайды.",
            },
          },
        },
        { headers: { "Cache-Control": "private, max-age=900" } },
      );
    }

    const historicalRecords = normalizeHistorical(await fetchVersion(historicalVersion, apiKey));
    return Response.json(
      {
        records: historicalRecords,
        meta: {
          ...source,
          status: "connected_with_warning",
          version: historicalVersion,
          historical: true,
          latestRecordCount: latestRecords.length,
          warning: {
            ru: "Последняя версия v14 содержит несоответствующую запись по Алматы. Поэтому показана последняя читаемая версия v11 только как историческая справка, не как подтверждение свободного участка.",
            kk: "Соңғы v14 нұсқасында Алматыға қатысты сәйкес емес жазба бар. Сондықтан соңғы оқылатын v11 нұсқасы тек тарихи анықтама ретінде көрсетіледі, бос телімді растау ретінде емес.",
          },
        },
      },
      { headers: { "Cache-Control": "private, max-age=900" } },
    );
  } catch (error) {
    return Response.json(
      {
        records: [],
        meta: {
          ...source,
          status: "unavailable",
          error: error instanceof Error ? error.message : "Dataset unavailable",
        },
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
