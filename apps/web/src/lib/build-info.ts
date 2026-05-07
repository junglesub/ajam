const repositoryUrl = process.env.NEXT_PUBLIC_REPOSITORY_URL || "https://github.com/junglesub/ajam";

function getRepositoryLabel(url: string): string {
  try {
    const repository = new URL(url).pathname.replace(/^\/|\/$/g, "");

    return repository || "junglesub/ajam";
  } catch {
    return url.replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/^\/|\/$/g, "") || "junglesub/ajam";
  }
}

function formatYYMMDD(date: Date): string {
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "00";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}${month}${day}`;
}

export function getBuildInfo() {
  const configuredVersion = process.env.NEXT_PUBLIC_BUILD_VERSION || process.env.BUILD_VERSION;

  return {
    copyrightYear: new Date().getFullYear(),
    repositoryLabel: getRepositoryLabel(repositoryUrl),
    repositoryUrl,
    version: configuredVersion || `dev-${formatYYMMDD(new Date())}`
  };
}
