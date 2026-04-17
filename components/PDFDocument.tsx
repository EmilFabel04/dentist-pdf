import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Report } from "@/app/api/generate/route";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "#0f62fe",
    paddingBottom: 12,
    marginBottom: 20,
  },
  logoBox: {
    width: 60,
    height: 60,
    borderWidth: 1,
    borderColor: "#bbb",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
  },
  logoText: {
    fontSize: 8,
    color: "#888",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  subheading: {
    fontSize: 9,
    color: "#555",
    marginTop: 2,
  },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  metaLabel: {
    fontSize: 9,
    color: "#777",
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: "bold",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8,
    color: "#0f62fe",
  },
  paragraph: {
    marginBottom: 6,
    lineHeight: 1.5,
  },
  table: {
    borderWidth: 1,
    borderColor: "#ddd",
    marginTop: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  tableHeaderRow: {
    backgroundColor: "#f0f3f9",
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  cellTooth: { width: "18%", padding: 6, fontWeight: "bold" },
  cellObs: { width: "62%", padding: 6 },
  cellSev: { width: "20%", padding: 6 },
  sevNormal: { color: "#198038" },
  sevMonitor: { color: "#d2a106" },
  sevUrgent: { color: "#da1e28", fontWeight: "bold" },
  bullet: {
    flexDirection: "row",
    marginBottom: 4,
  },
  bulletDot: {
    width: 10,
  },
  imagesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  xrayWrap: {
    width: "48%",
    marginBottom: 10,
  },
  xrayImage: {
    width: "100%",
    height: 180,
    objectFit: "contain",
    backgroundColor: "#000",
  },
  xrayCaption: {
    fontSize: 8,
    color: "#777",
    marginTop: 3,
    textAlign: "center",
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#999",
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingTop: 6,
  },
});

type Props = {
  patientName: string;
  date: string;
  report: Report;
  imageDataUrls: string[];
};

export function ConsultationPDF({
  patientName,
  date,
  report,
  imageDataUrls,
}: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Consultation Report</Text>
            <Text style={styles.subheading}>Dental practice</Text>
          </View>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>LOGO</Text>
          </View>
        </View>

        <View style={styles.meta}>
          <View>
            <Text style={styles.metaLabel}>PATIENT</Text>
            <Text style={styles.metaValue}>{patientName || "—"}</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>DATE</Text>
            <Text style={styles.metaValue}>{date}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Summary</Text>
        <Text style={styles.paragraph}>{report.patientSummary}</Text>

        <Text style={styles.sectionTitle}>Findings</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.cellTooth}>Tooth</Text>
            <Text style={styles.cellObs}>Observation</Text>
            <Text style={styles.cellSev}>Severity</Text>
          </View>
          {report.findings.map((f, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.cellTooth}>{f.tooth}</Text>
              <Text style={styles.cellObs}>{f.observation}</Text>
              <Text
                style={[
                  styles.cellSev,
                  f.severity === "urgent"
                    ? styles.sevUrgent
                    : f.severity === "monitor"
                      ? styles.sevMonitor
                      : styles.sevNormal,
                ]}
              >
                {f.severity.toUpperCase()}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Recommendations</Text>
        {report.recommendations.map((r, i) => (
          <View key={i} style={styles.bullet}>
            <Text style={styles.bulletDot}>•</Text>
            <Text style={{ flex: 1 }}>{r}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Follow-up</Text>
        <Text style={styles.paragraph}>{report.followUp}</Text>

        {imageDataUrls.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>X-ray Images</Text>
            <View style={styles.imagesGrid}>
              {imageDataUrls.map((src, i) => (
                <View key={i} style={styles.xrayWrap}>
                  <Image style={styles.xrayImage} src={src} />
                  <Text style={styles.xrayCaption}>X-ray {i + 1}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages} · Generated ${date}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
