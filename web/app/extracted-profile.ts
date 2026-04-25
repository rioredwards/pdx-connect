export type Citation = { field?: string; sourceUrl?: string; snippet?: string };
export type Contact = { emails?: string[]; phones?: string[]; contactPageUrl?: string };
export type Location = { address?: string; city?: string; region?: string; country?: string };

export type ExtractedProfile = {
  websiteUrl?: string;
  name?: string;
  description?: string;
  categories?: string[];
  location?: Location;
  serviceArea?: string;
  contact?: Contact;
  valueProps?: string[];
  productsServices?: string[];
  socialLinks?: string[];
  hours?: string;
  citations?: Citation[];
};
