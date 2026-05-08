import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_ICON_URL = '/favicon.png';
const LEGACY_DEFAULT_ICON_URL = '/api/uploads/default_icon.png';
const LEGACY_DEFAULT_FAVICON_URL = '/api/uploads/default_favicon.png';

export class SettingsService {
  private static instance: SettingsService;
  private cachedSettings: any = null;

  public static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  private normalizeBrandingDefaults(settings: any) {
    if (!settings) return settings;

    const normalizedIcon =
      settings.iconUrl === LEGACY_DEFAULT_ICON_URL ? DEFAULT_ICON_URL : settings.iconUrl;
    const normalizedFavicon =
      settings.faviconUrl === LEGACY_DEFAULT_FAVICON_URL ? DEFAULT_ICON_URL : settings.faviconUrl;

    return {
      ...settings,
      iconUrl: normalizedIcon,
      faviconUrl: normalizedFavicon,
    };
  }

  async getSettings() {
    try {
      let settings = await prisma.globalSettings.findFirst();

      if (!settings) {
        settings = await prisma.globalSettings.create({
          data: {
            singleton: true,
            wahaHost: '',
            wahaApiKey: '',
            evolutionHost: '',
            evolutionApiKey: '',
            companyName: 'Astra Campaign',
            pageTitle: 'Sistema de Gestao de Contatos',
            iconUrl: DEFAULT_ICON_URL,
            faviconUrl: DEFAULT_ICON_URL,
          },
        });
      }

      const normalizedSettings = this.normalizeBrandingDefaults(settings);
      this.cachedSettings = normalizedSettings;
      return normalizedSettings;
    } catch (error) {
      console.error('Error getting settings:', error);
      return {
        wahaHost: '',
        wahaApiKey: '',
        evolutionHost: '',
        evolutionApiKey: '',
        quepasaUrl: '',
        quepasaLogin: '',
        quepasaPassword: '',
        companyName: '',
        logoUrl: null,
        faviconUrl: DEFAULT_ICON_URL,
        pageTitle: 'Sistema de Gestao de Contatos',
        iconUrl: DEFAULT_ICON_URL,
      };
    }
  }

  async updateSettings(data: {
    wahaHost?: string;
    wahaApiKey?: string;
    evolutionHost?: string;
    evolutionApiKey?: string;
    quepasaUrl?: string;
    quepasaLogin?: string;
    quepasaPassword?: string;
    logoUrl?: string | null;
    companyName?: string;
    faviconUrl?: string | null;
    pageTitle?: string;
    iconUrl?: string | null;
  }) {
    try {
      let settings = await prisma.globalSettings.findFirst();

      if (settings) {
        settings = await prisma.globalSettings.update({
          where: { id: settings.id },
          data: {
            wahaHost: data.wahaHost !== undefined ? data.wahaHost : settings.wahaHost,
            wahaApiKey: data.wahaApiKey !== undefined ? data.wahaApiKey : settings.wahaApiKey,
            evolutionHost: data.evolutionHost !== undefined ? data.evolutionHost : settings.evolutionHost,
            evolutionApiKey: data.evolutionApiKey !== undefined ? data.evolutionApiKey : settings.evolutionApiKey,
            quepasaUrl: data.quepasaUrl !== undefined ? data.quepasaUrl : settings.quepasaUrl,
            quepasaLogin: data.quepasaLogin !== undefined ? data.quepasaLogin : settings.quepasaLogin,
            quepasaPassword: data.quepasaPassword !== undefined ? data.quepasaPassword : settings.quepasaPassword,
            logoUrl: data.logoUrl !== undefined ? data.logoUrl : settings.logoUrl,
            companyName: data.companyName !== undefined ? data.companyName : settings.companyName,
            faviconUrl: data.faviconUrl !== undefined ? data.faviconUrl : settings.faviconUrl,
            pageTitle: data.pageTitle !== undefined ? data.pageTitle : settings.pageTitle,
            iconUrl: data.iconUrl !== undefined ? data.iconUrl : settings.iconUrl,
          },
        });
      } else {
        settings = await prisma.globalSettings.create({
          data: {
            singleton: true,
            wahaHost: data.wahaHost || '',
            wahaApiKey: data.wahaApiKey || '',
            evolutionHost: data.evolutionHost || '',
            evolutionApiKey: data.evolutionApiKey || '',
            quepasaUrl: data.quepasaUrl || '',
            quepasaLogin: data.quepasaLogin || '',
            quepasaPassword: data.quepasaPassword || '',
            logoUrl: data.logoUrl || null,
            companyName: data.companyName || 'Astra Campaign',
            faviconUrl: data.faviconUrl || DEFAULT_ICON_URL,
            pageTitle: data.pageTitle || 'Sistema de Gestao de Contatos',
            iconUrl: data.iconUrl || DEFAULT_ICON_URL,
          },
        });
      }

      const normalizedSettings = this.normalizeBrandingDefaults(settings);
      this.cachedSettings = null;
      return normalizedSettings;
    } catch (error) {
      console.error('Error updating settings:', error);
      throw error;
    }
  }

  getCachedSettings() {
    return this.cachedSettings;
  }

  async getWahaConfig() {
    const settings = await this.getSettings();
    return {
      host: settings.wahaHost,
      apiKey: settings.wahaApiKey,
    };
  }

  async getEvolutionConfig() {
    const settings = await this.getSettings();
    return {
      host: settings.evolutionHost,
      apiKey: settings.evolutionApiKey,
    };
  }

  async getQuepasaConfig() {
    const settings = await this.getSettings();
    return {
      url: settings.quepasaUrl,
      login: settings.quepasaLogin,
      password: settings.quepasaPassword,
    };
  }
}

export const settingsService = SettingsService.getInstance();