const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

// Налаштування додатку
const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());

// Параметри підключення до MongoDB
const uri = "mongodb+srv://IS_Admin:db_password@hillelqatechpro.lcrcl1a.mongodb.net/?retryWrites=true&w=majority&appName=HillelQATechPro"
const client = new MongoClient(uri);
const dbName = "sample_airbnb"; // Назва вашої бази даних

// Змінна для збереження підключення до бази даних
let db;

  // Допоміжна функція для обробки параметрів запиту MongoDB
  function parseQueryParams(query) {
    const result = {};
    
    // Обробка параметрів пагінації та сортування
    const specialParams = ['page', 'limit', 'sortBy', 'sortOrder'];
    
    // Обробка звичайних параметрів запиту
    Object.keys(query).forEach(key => {
      // Пропускаємо спеціальні параметри
      if (specialParams.includes(key)) return;
      
      // Обробка операторів MongoDB ($gte, $lte, тощо)
      if (key.includes('[$')) {
        const [fieldName, operator] = key.match(/([^[]+)(?:\[(.*?)\])?/).slice(1, 3);
        if (!result[fieldName]) result[fieldName] = {};
        result[fieldName][operator] = isNaN(query[key]) ? query[key] : Number(query[key]);
      } 
      // Обробка числових значень
      else if (!isNaN(query[key]) && key !== 'amenities') {
        result[key] = Number(query[key]);
      }
      // Спеціальна обробка для масивів (наприклад, amenities)
      else if (key === 'amenities') {
        result[key] = { $in: [query[key]] };
      }
      // Зберігаємо як є для інших типів
      else {
        result[key] = query[key];
      }
    });
    
    return result;
  }  

// Підключення до бази даних і запуск сервера
async function startServer() {
    try {
      await client.connect();
      db = client.db(dbName);
      console.log("Підключено до MongoDB");
      
      app.listen(port, () => {
        console.log(`API-сервер працює на порту ${port}`);
      });
    } catch (error) {
      console.error("Помилка при запуску:", error);
      process.exit(1);
    }
  }
  
  // Запуск сервера
  startServer();
  
  // Обробка помилок при завершенні роботи
  process.on('SIGINT', async () => {
    await client.close();
    console.log('MongoDB з\'єднання закрито');
    process.exit(0);
  });
  
  // МАРШРУТИ API
  
  // Оновіть маршрут GET для отримання всіх документів з підтримкою фільтрації
  app.get('/api/:collection', async (req, res) => {
    try {
      const collectionName = req.params.collection;
      const collection = db.collection(collectionName);
      
      // Параметри пагінації
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      
      // Параметри сортування
      const sortField = req.query.sortBy || '_id';
      const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
      const sortOptions = {};
      sortOptions[sortField] = sortOrder;
      
      // Обробка фільтрів
      const filter = parseQueryParams(req.query);
      
      // Виконання запиту
      const [data, total] = await Promise.all([
        collection.find(filter)
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          .toArray(),
        collection.countDocuments(filter)
      ]);
      
      // Результат
      const totalPages = Math.ceil(total / limit);
      
      res.json({
        data,
        meta: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Отримати документ за ID
  app.get('/api/:collection/:id', async (req, res) => {
    try {
      const collectionName = req.params.collection;
      const id = req.params.id;
      const collection = db.collection(collectionName);
      
      let result;
      
      // Спочатку перевіряємо, чи ID є валідним ObjectId
      if (ObjectId.isValid(id)) {
        result = await collection.findOne({ _id: new ObjectId(id) });
      }
      
      // Якщо не знайдено за ObjectId або id не є валідним ObjectId, спробуємо шукати за строковим id
      if (!result) {
        result = await collection.findOne({ _id: id });
      }
      
      // Якщо все ще не знайдено, спробуємо шукати за числовим id
      if (!result && !isNaN(id)) {
        const numericId = Number(id);
        result = await collection.findOne({ _id: numericId });
      }
      
      if (!result) {
        return res.status(404).json({ error: "Документ не знайдено" });
      }
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Створити новий документ
  app.post('/api/:collection', async (req, res) => {
    try {
      const collectionName = req.params.collection;
      const document = req.body;
      
      const collection = db.collection(collectionName);
      const result = await collection.insertOne(document);
      
      res.status(201).json({
        _id: result.insertedId,
        ...document
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Оновити документ
  app.put('/api/:collection/:id', async (req, res) => {
    try {
      const collectionName = req.params.collection;
      const id = req.params.id;
      const updates = req.body;
      
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Невірний формат ID" });
      }
      
      // Видаляємо _id з оновлень, якщо воно є
      delete updates._id;
      
      const collection = db.collection(collectionName);
      const result = await collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updates }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: "Документ не знайдено" });
      }
      
      res.json({
        message: "Документ оновлено успішно",
        modifiedCount: result.modifiedCount
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Видалити документ
  app.delete('/api/:collection/:id', async (req, res) => {
    try {
      const collectionName = req.params.collection;
      const id = req.params.id;
      
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Невірний формат ID" });
      }
      
      const collection = db.collection(collectionName);
      const result = await collection.deleteOne({ _id: new ObjectId(id) });
      
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: "Документ не знайдено" });
      }
      
      res.json({ message: "Документ видалено успішно" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Пошук документів за параметрами (через query string) з пагінацією
//   app.get('/api/:collection/search', async (req, res) => {
//     try {
//       const collectionName = req.params.collection;
      
//       // Копіюємо query параметри та видаляємо параметри пагінації
//       const query = { ...req.query };
//       const paginationParams = ['page', 'limit', 'sortBy', 'sortOrder'];
//       paginationParams.forEach(param => delete query[param]);
      
//       // Параметри пагінації
//       const page = parseInt(req.query.page) || 1;
//       const limit = parseInt(req.query.limit) || 10;
//       const skip = (page - 1) * limit;
      
//       // Додатково: параметри сортування
//       const sortField = req.query.sortBy || '_id';
//       const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
//       const sortOptions = {};
//       sortOptions[sortField] = sortOrder;
      
//       // Конвертація рядкових значень у відповідні типи (за необхідності)
//       Object.keys(query).forEach(key => {
//         // Конвертація рядкових представлень ObjectId
//         if (ObjectId.isValid(query[key])) {
//           query[key] = new ObjectId(query[key]);
//         }
//         // Можна додати інші конвертації (числа, булеві значення тощо)
//       });
      
//       const collection = db.collection(collectionName);
      
//       // Виконання запиту з пагінацією
//       const [data, total] = await Promise.all([
//         collection.find(query)
//           .sort(sortOptions)
//           .skip(skip)
//           .limit(limit)
//           .toArray(),
//         collection.countDocuments(query)
//       ]);
      
//       // Метадані пагінації
//       const totalPages = Math.ceil(total / limit);
      
//       res.json({
//         data,
//         meta: {
//           total,
//           page,
//           limit,
//           totalPages,
//           hasNextPage: page < totalPages,
//           hasPrevPage: page > 1,
//           query: query // Повертаємо застосовані фільтри для зручності
//         }
//       });
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   });
  
  // Виправлення маршрутів конфлікту між search та id
//   app.get('/api/:collection/search/:term', async (req, res) => {
//     return res.redirect(`/api/${req.params.collection}/search?term=${req.params.term}`);
//   });