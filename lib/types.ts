export type TreatmentCode = {
  code: string;
  description: string;
  price: number;
};

export type Treatment = {
  id: string;
  name: string;
  category: string;
  codes: TreatmentCode[];
  termsAndConditions: string;
};

export type TemplateStyling = {
  primaryColor: string;
  logoPosition: "left" | "center" | "right";
  headerText: string;
};

export type Template = {
  id: string;
  name: string;
  type: "clinical" | "estimate";
  sections: string[];
  sectionOrder: number[];
  styling: TemplateStyling;
};

export type PracticeSettings = {
  name: string;
  logo: string;
  address: string;
  phone: string;
  email: string;
  vatNumber: string;
  currency: string;
  vatRate: number;
  quoteValidityDays: number;
  defaultPaymentTerms: string;
};

export type Report = {
  patientSummary: string;
  findings: {
    tooth: string;
    observation: string;
    severity: "normal" | "monitor" | "urgent";
  }[];
  recommendations: string[];
  followUp: string;
  suggestedTreatments: string[];
};

export type SelectedTreatment = {
  treatment: Treatment;
  selectedCodes: {
    code: string;
    description: string;
    price: number;
    quantity: number;
  }[];
};
