// ==============================================================================
// CLIENTE Y SINCRONIZADOR DE SUPABASE - JUNGLES & LA CHICHERA
// Sincronización en la nube con soporte offline automático
// ==============================================================================

const SupabaseService = (() => {
  const STORAGE_KEY_URL = 'jungles_supabase_url';
  const STORAGE_KEY_KEY = 'jungles_supabase_key';

  // Credenciales oficiales de Supabase configuradas por el usuario
  const DEFAULT_SUPABASE_URL = 'https://pnmqebbezoztagkybuvg.supabase.co';
  const DEFAULT_SUPABASE_KEY = 'sb_publishable_Evs4MbyZj3wR8DWCDTK_0A_tSefd6Gh';

  let client = null;
  let realtimeChannel = null;

  // Limpiar URL si el usuario copió con /rest/v1 o barras finales
  function cleanSupabaseUrl(url) {
    if (!url) return '';
    let cleaned = url.trim();
    cleaned = cleaned.replace(/\/rest\/v1\/?$/, '');
    cleaned = cleaned.replace(/\/+$/, '');
    return cleaned;
  }

  // Cargar credenciales guardadas (o las oficiales por defecto)
  function getCredentials() {
    const savedUrl = localStorage.getItem(STORAGE_KEY_URL);
    const savedKey = localStorage.getItem(STORAGE_KEY_KEY);
    return {
      url: cleanSupabaseUrl(savedUrl || DEFAULT_SUPABASE_URL),
      key: (savedKey || DEFAULT_SUPABASE_KEY).trim()
    };
  }

  function setCredentials(url, key) {
    if (url && key) {
      const cleaned = cleanSupabaseUrl(url);
      localStorage.setItem(STORAGE_KEY_URL, cleaned);
      localStorage.setItem(STORAGE_KEY_KEY, key.trim());
      initClient();
      return true;
    }
    return false;
  }

  function removeCredentials() {
    localStorage.removeItem(STORAGE_KEY_URL);
    localStorage.removeItem(STORAGE_KEY_KEY);
    client = null;
    if (realtimeChannel) {
      realtimeChannel.unsubscribe();
      realtimeChannel = null;
    }
  }

  function isConfigured() {
    const creds = getCredentials();
    return Boolean(creds.url && creds.key);
  }

  // Inicializar cliente Supabase si SDK y credenciales existen
  function initClient() {
    const creds = getCredentials();
    if (!creds.url || !creds.key) {
      client = null;
      return null;
    }

    try {
      if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        client = window.supabase.createClient(creds.url, creds.key);
        return client;
      }
    } catch (e) {
      console.error('Error al inicializar cliente Supabase:', e);
      client = null;
    }
    return null;
  }

  // Probar conexión con credenciales
  async function testConnection(testUrl, testKey) {
    try {
      if (!testUrl || !testKey) throw new Error('Debes ingresar la URL y la Anon Key');
      const cleanUrl = cleanSupabaseUrl(testUrl);
      const tempClient = window.supabase.createClient(cleanUrl, testKey.trim());
      const { data, error } = await tempClient.from('cierres').select('id').limit(1);
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      return { success: true, count: data ? data.length : 0 };
    } catch (err) {
      return { success: false, error: err.message || 'No se pudo conectar con Supabase' };
    }
  }

  // Conversión de formato Objeto App -> Fila BD Supabase
  function toDbRow(c) {
    return {
      id: c.id,
      date: c.date,
      venue: c.venue,
      venue_name: c.venueName || (c.venue === 'jungles' ? 'Jungles Bar' : 'La Chichera'),
      efectivo: Number(c.efectivo || 0),
      datafono1: Number(c.datafono1 || 0),
      datafono2: Number(c.datafono2 || 0),
      total_datafonos: Number(c.totalDatafonos || 0),
      total_creditos: Number(c.totalCreditos || 0),
      total_ventas: Number(c.totalVentas || 0),
      servicio_pct: Number(c.servicioPct || 10),
      servicio_monto: Number(c.servicioMonto || 0),
      total_empleados: Number(c.totalEmpleados || 0),
      balance_neto: Number(c.balanceNeto || 0),
      creditos: c.creditos || [],
      empleados: c.empleados || [],
      notes: c.notes || '',
      updated_at: new Date().toISOString()
    };
  }

  // Conversión de formato Fila BD Supabase -> Objeto App
  function fromDbRow(r) {
    return {
      id: r.id,
      date: r.date,
      venue: r.venue,
      venueName: r.venue_name || (r.venue === 'jungles' ? 'Jungles Bar' : 'La Chichera'),
      efectivo: Number(r.efectivo || 0),
      datafono1: Number(r.datafono1 || 0),
      datafono2: Number(r.datafono2 || 0),
      totalDatafonos: Number(r.total_datafonos || 0),
      totalCreditos: Number(r.total_creditos || 0),
      totalVentas: Number(r.total_ventas || 0),
      servicioPct: Number(r.servicio_pct || 10),
      servicioMonto: Number(r.servicio_monto || 0),
      totalEmpleados: Number(r.total_empleados || 0),
      balanceNeto: Number(r.balance_neto || 0),
      creditos: Array.isArray(r.creditos) ? r.creditos : [],
      empleados: Array.isArray(r.empleados) ? r.empleados : [],
      notes: r.notes || '',
      createdAt: r.created_at
    };
  }

  // Obtener todos los cierres desde la nube
  async function fetchClosures() {
    if (!client) initClient();
    if (!client) return null;

    try {
      const { data, error } = await client
        .from('cierres')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;
      return data.map(fromDbRow);
    } catch (err) {
      console.warn('Error al consultar Supabase, usando respaldo local:', err);
      return null;
    }
  }

  // Guardar un nuevo cierre en la nube
  async function saveClosure(closure) {
    if (!client) initClient();
    if (!client) return false;

    try {
      const row = toDbRow(closure);
      const { error } = await client.from('cierres').upsert(row);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error al guardar en Supabase:', err);
      return false;
    }
  }

  // Eliminar un cierre de la nube
  async function deleteClosure(id) {
    if (!client) initClient();
    if (!client) return false;

    try {
      const { error } = await client.from('cierres').delete().eq('id', id);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error al eliminar de Supabase:', err);
      return false;
    }
  }

  // Eliminar todos los cierres de la nube (dejar en 0)
  async function deleteAllClosures() {
    if (!client) initClient();
    if (!client) return false;

    try {
      const { error } = await client.from('cierres').delete().neq('id', '___all_records_filter___');
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error al vaciar Supabase:', err);
      return false;
    }
  }

  // Subir todos los cierres locales a la nube (Sincronización masiva inicial)
  async function syncLocalToCloud(localClosures) {
    if (!client) initClient();
    if (!client || !localClosures || localClosures.length === 0) return 0;

    try {
      const rows = localClosures.map(toDbRow);
      const { error } = await client.from('cierres').upsert(rows);
      if (error) throw error;
      return rows.length;
    } catch (err) {
      console.error('Error en sincronización masiva a Supabase:', err);
      return 0;
    }
  }

  // Suscribirse a cambios en tiempo real
  function subscribeRealtime(onSyncChange) {
    if (!client) initClient();
    if (!client) return;

    if (realtimeChannel) {
      realtimeChannel.unsubscribe();
    }

    try {
      realtimeChannel = client
        .channel('public:cierres')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cierres' }, (payload) => {
          if (typeof onSyncChange === 'function') {
            onSyncChange(payload);
          }
        })
        .subscribe();
    } catch (e) {
      console.warn('Realtime no disponible:', e);
    }
  }

  return {
    getCredentials,
    setCredentials,
    removeCredentials,
    isConfigured,
    testConnection,
    fetchClosures,
    saveClosure,
    deleteClosure,
    deleteAllClosures,
    syncLocalToCloud,
    subscribeRealtime,
    initClient
  };
})();

// Inicializar cliente al cargar el script
document.addEventListener('DOMContentLoaded', () => {
  SupabaseService.initClient();
});
