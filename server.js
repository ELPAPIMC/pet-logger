// server.js - Para Node.js/Express o Vercel Serverless
const express = require('express');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Base de datos en memoria (usa MongoDB/Redis en producción)
const gameInstances = new Map();
const MAX_STORED_INSTANCES = 100;
const INSTANCE_TTL = 3600000; // 1 hora en ms

// Limpiar instancias antiguas
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of gameInstances.entries()) {
    if (now - data.timestamp * 1000 > INSTANCE_TTL) {
      gameInstances.delete(key);
    }
  }
}, 300000); // Cada 5 minutos

// POST - Recibir datos del script de Roblox
app.post('/api/report', (req, res) => {
  try {
    const { placeId, gameInstanceId, animalData, timestamp, source } = req.body;

    // Validación básica
    if (!placeId || !gameInstanceId || !animalData) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }

    // Validar que el valor sea mayor a 3M
    if (animalData.value < 3000000) {
      return res.status(200).json({ 
        success: true, 
        message: 'Value too low, not stored' 
      });
    }

    const key = `${placeId}_${gameInstanceId}`;
    
    // Guardar o actualizar instancia
    const instanceData = {
      placeId,
      gameInstanceId,
      animalData: {
        displayName: animalData.displayName,
        value: animalData.value,
        generation: animalData.generation,
        rarity: animalData.rarity
      },
      timestamp: timestamp || Math.floor(Date.now() / 1000),
      source: source || 'unknown',
      lastUpdated: Date.now()
    };

    gameInstances.set(key, instanceData);

    // Limitar tamaño del Map
    if (gameInstances.size > MAX_STORED_INSTANCES) {
      const firstKey = gameInstances.keys().next().value;
      gameInstances.delete(firstKey);
    }

    console.log(`[REPORT] Stored: ${animalData.displayName} - ${animalData.generation} in ${gameInstanceId}`);

    res.json({ 
      success: true, 
      message: 'Instance stored successfully',
      instanceId: key
    });

  } catch (error) {
    console.error('Error processing report:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// GET - Obtener todas las instancias activas (para el auto-joiner)
app.get('/api/instances', (req, res) => {
  try {
    const minValue = parseInt(req.query.minValue) || 3000000;
    const limit = parseInt(req.query.limit) || 50;

    // Convertir Map a array y filtrar
    const instances = Array.from(gameInstances.values())
      .filter(instance => instance.animalData.value >= minValue)
      .sort((a, b) => b.animalData.value - a.animalData.value)
      .slice(0, limit);

    res.json({
      success: true,
      count: instances.length,
      instances: instances.map(inst => ({
        placeId: inst.placeId,
        gameInstanceId: inst.gameInstanceId,
        animal: {
          name: inst.animalData.displayName,
          value: inst.animalData.value,
          generation: inst.animalData.generation,
          rarity: inst.animalData.rarity
        },
        timestamp: inst.timestamp,
        age: Math.floor((Date.now() - inst.lastUpdated) / 1000) // segundos desde última actualización
      }))
    });

  } catch (error) {
    console.error('Error fetching instances:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// GET - Obtener mejor instancia actual
app.get('/api/best', (req, res) => {
  try {
    if (gameInstances.size === 0) {
      return res.json({
        success: true,
        instance: null,
        message: 'No instances available'
      });
    }

    // Encontrar la mejor instancia
    let bestInstance = null;
    let bestValue = 0;

    for (const instance of gameInstances.values()) {
      if (instance.animalData.value > bestValue) {
        bestValue = instance.animalData.value;
        bestInstance = instance;
      }
    }

    res.json({
      success: true,
      instance: bestInstance ? {
        placeId: bestInstance.placeId,
        gameInstanceId: bestInstance.gameInstanceId,
        animal: {
          name: bestInstance.animalData.displayName,
          value: bestInstance.animalData.value,
          generation: bestInstance.animalData.generation,
          rarity: bestInstance.animalData.rarity
        },
        timestamp: bestInstance.timestamp,
        age: Math.floor((Date.now() - bestInstance.lastUpdated) / 1000)
      } : null
    });

  } catch (error) {
    console.error('Error fetching best instance:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// GET - Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    instances: gameInstances.size,
    uptime: process.uptime()
  });
});

// DELETE - Limpiar instancia específica
app.delete('/api/instance/:gameInstanceId', (req, res) => {
  try {
    const { gameInstanceId } = req.params;
    let deleted = false;

    for (const [key, instance] of gameInstances.entries()) {
      if (instance.gameInstanceId === gameInstanceId) {
        gameInstances.delete(key);
        deleted = true;
        break;
      }
    }

    res.json({ 
      success: true, 
      deleted 
    });

  } catch (error) {
    console.error('Error deleting instance:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Para desarrollo local
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Para Vercel
module.exports = app;
