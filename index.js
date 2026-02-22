const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const cors = require("cors");
const mysql = require("mysql");
const session = require("express-session");
const PORT = process.env.PORT || 3001




const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "toor",
  database: "bits",
});
module.exports = db;

//db.connect();
app.use(
  cors({
    origin: "https://bob-and-tom3-okg7.vercel.app/",
    credentials: true
  })
);
app.use(
  session({
    secret: "superSecretKey123", // change this later
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // true only in HTTPS production
      httpOnly: true,
    },
  })
);
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- Auth middleware ---
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
};

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userRole = req.session.user.role;

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: "Forbidden: Insufficient role" });
    }

    next();
  };
};

app.get("/api/admin/dashboard",
  isAuthenticated,
  requireRole("admin", "owner"),
  (req, res) => {
    res.json({
      message: "Welcome to the admin dashboard",
      user: req.session.user
    });
  }
);


app.post("/api/delete/bit", (req, res) => {

  const bitID = req.body.bitID;

  const deleteBit = "DELETE FROM tblbits WHERE BitID = ?";
  db.query(deleteBit, [bitID], (err, result) => {});

  const deleteAlbum = "DELETE FROM tblalbum WHERE BitID = ?";
  db.query(deleteAlbum, [bitID], (err, result) =>{});

  const deleteCategory = "DELETE FROM tblcategory WHERE BitID = ?";
  db.query(deleteCategory, [bitID], (err, result) => {});

  const deleteCelebrity = "DELETE FROM tblcelebrity WHERE BitID = ?";
  db.query(deleteCelebrity, [bitID], (err, result) => {});

  const deleteHyperlink = "DELETE FROM tblhyperlink WHERE BitID = ?";
  db.query(deleteHyperlink, [bitID], (err, result) => {});

  const deleteKeywords = "DELETE FROM tblkeywords WHERE BitID = ?";
  db.query(deleteKeywords, [bitID], (err, result) => {});

  const deleteSeason = "DELETE FROM tblseason WHERE BitID = ?";
  const deleteSport = "DELETE FROM tblsports WHERE BitID = ?";
  db.query(deleteSport, [bitID], (err, result) => {});

  const deleteSubject = "DELETE FROM tblsubject WHERE BitID = ?";
  db.query(deleteSubject, [bitID], (err, result) => {});
});

app.post("/api/delete/log", (req, res) => {
  const RS_ID = req.body.RS_ID;
  
  const deleteLog = "DELETE e, k, d FROM tblrunentries e JOIN tblrunkey k ON e.L_ID = k.L_ID JOIN tblrunsheetdate d ON k.RS_ID = d.RS_ID WHERE k.RS_ID = ?;"
  db.query(deleteLog, RS_ID, (err, result) => {
    if(err){
      console.log(err);
    }
    res.send(result);
  })
})
/*
app.get("/", (req, res) => {
 //res.send("did it send?");
 const sqlSelect = "SELECT * FROM bits.tblartist";
  // res.send()
  db.query(sqlSelect, (err, result) => {
  console.log("result: " + result);
  console.log("error: "+ err);
  res.send(result);
  
})
  
});*/


app.post("/api/edit/runSheet", (req, res) => {
  const { RS_ID, logDate, data, deletedRows } = req.body;

  if (!RS_ID || !Array.isArray(data)) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  // 0️⃣ DELETE removed rows first
  if (Array.isArray(deletedRows) && deletedRows.length > 0) {
    const deleteSql = `DELETE FROM tblrunentries WHERE L_ID IN (?)`;
    db.query(deleteSql, [deletedRows], (err) => {
      if (err) console.error("Failed to delete rows:", err);
    });
  }

  // 1️⃣ Update run sheet date
  const updateDateSql = `
    UPDATE tblrunsheetdate
    SET RSDate = ?
    WHERE RS_ID = ?
  `;

  db.query(updateDateSql, [logDate, RS_ID], (err) => {
    if (err) {
      console.error("Date update failed:", err);
      return res.status(500).json({ error: "Failed to update date" });
    }

    // 2️⃣ Separate rows for update vs insert
    const rowsToUpdate = data.filter((row) => row.L_ID);
    const rowsToInsert = data.filter(
      (row) => !row.L_ID && (row.bTime || row.bitDesc || row.ArtistID)
    );

    // 3️⃣ Update existing rows
    const updatePromises = rowsToUpdate.map((row) => {
      return new Promise((resolve, reject) => {
        const updateSql = `
          UPDATE tblrunentries
          SET bTime = ?, bitDesc = ?, ArtistID = ?
          WHERE L_ID = ?
        `;
        db.query(updateSql, [row.bTime, row.bitDesc, row.ArtistID, row.L_ID], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    // 4️⃣ Insert new rows with corresponding tblrunkey entries
    const insertPromises = rowsToInsert.map((row) => {
      return new Promise((resolve, reject) => {
        const insertKeySql = `INSERT INTO tblrunkey (RS_ID) VALUES (?)`;
        db.query(insertKeySql, [RS_ID], (err, keyResult) => {
          if (err) return reject(err);

          const newL_ID = keyResult.insertId;

          const insertEntrySql = `
            INSERT INTO tblrunentries (L_ID, bTime, bitDesc, ArtistID)
            VALUES (?, ?, ?, ?)
          `;
          db.query(insertEntrySql, [newL_ID, row.bTime, row.bitDesc, row.ArtistID], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
    });

    // 5️⃣ Run all updates and inserts
    Promise.all([...updatePromises, ...insertPromises])
      .then(() => {
        res.json({ message: "Run sheet updated successfully" });
      })
      .catch((err) => {
        console.error("Update/Insert failed:", err);
        res.status(500).json({ error: "Failed to update run sheet" });
      });
  });
});




app.post("/api/insert/runSheet", (req, res) => {
  const { logDate, rows } = req.body;

  console.log("Received payload:", req.body);

  // Validate input
  if (!logDate) {
    return res.status(400).send("logDate is required");
  }

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).send("No rows provided");
  }

  // Filter out empty rows
  const cleanedRows = rows
    .map(r => ({
      time: (r.time || "").trim(),
      desc: (r.desc || "").trim(),
      artist: r.artist || null,
    }))
    .filter(r => r.time || r.desc || r.artist);

  if (cleanedRows.length === 0) {
    return res.status(400).send("All rows are empty");
  }

  // Prepare data for bulk insert
  const values = cleanedRows.map(r => [r.time, r.desc, r.artist]);

  // Step 1: Insert into tblrunentries
  const insertEntriesSQL = "INSERT INTO tblrunentries (bTime, bitDesc, ArtistID) VALUES ?";
  db.query(insertEntriesSQL, [values], (err, result) => {
    if (err) {
      console.error("Error inserting into tblrunentries:", err);
      return res.status(500).send("Failed to insert run sheet entries");
    }

    const insertedIds = [];
    for (let i = 0; i < values.length; i++) {
      insertedIds.push(result.insertId + i);
    }

    // Step 2: Ensure the RS_ID exists in tblrunsheetdate
    const selectRS_SQL = "SELECT RS_ID FROM tblrunsheetdate WHERE RSDate = ? LIMIT 1";
    db.query(selectRS_SQL, [logDate], (err, rsResult) => {
      if (err) {
        console.error("Error selecting RS_ID:", err);
        return res.status(500).send("Failed to check run sheet date");
      }

      const attachRowsToSheet = (rs_id) => {
        // Step 3: Insert into tblrunkey
        const runKeyValues = insertedIds.map(id => [rs_id, id]);
        const insertRunKeySQL = "INSERT INTO tblrunkey (RS_ID, L_ID) VALUES ?";
        db.query(insertRunKeySQL, [runKeyValues], (err) => {
          if (err) {
            console.error("Error inserting into tblrunkey:", err);
            return res.status(500).send("Failed to attach entries to run sheet");
          }
          return res.send({ message: "Run sheet saved successfully", RS_ID: rs_id });
        });
      };

      if (rsResult.length > 0) {
        attachRowsToSheet(rsResult[0].RS_ID);
      } else {
        // Insert new date if it doesn't exist
        const insertDateSQL = "INSERT INTO tblrunsheetdate (RSDate) VALUES (?)";
        db.query(insertDateSQL, [logDate], (err, insertDateResult) => {
          if (err) {
            console.error("Error inserting new RSDate:", err);
            return res.status(500).send("Failed to create new run sheet date");
          }
          attachRowsToSheet(insertDateResult.insertId);
        });
      }
    });
  });
});



  /*
  if (values.length) {
    let sql = "INSERT INTO tblrunentries (bTime, bitDesc, ArtistID) VALUES ?";
    console.log(values);
    db.query(sql, [values], function (err, result) {
      if (err) {
        console.log(err);
        res.status(500).send(err);
    } else {
        const primaryKeys = [];
        
        for (let i = 0; i < values.length; i++) {
            primaryKeys.push(result.insertId + i);
        }

        let sql2 = "SELECT RS_ID FROM tblrunkey ORDER BY RS_ID DESC LIMIT 1";
        db.query(sql2, (err, result) => {
          if(err){
            console.log(err);
            res.status(500).send(err);

          }
          else{
            let rs_id = result[0].RS_ID + 1;
            let rsvalues = [];
            primaryKeys.forEach(key => {
              rsvalues.push([rs_id, key]);
            });
            console.log(rsvalues);
            let sql3 = "INSERT INTO tblrunkey (RS_ID, L_ID) VALUES ?";
            db.query(sql3, [rsvalues], (err, result) => {
              if(err){
                console.log(err);
                res.status(500).send(err);
              }
              else{
                let sql4 = "INSERT INTO tblrunsheetdate (RS_ID, RSDate) VALUES (?, ?)";
                db.query(sql4, [rs_id, logDate], (err, result) => {
                  if(err){
                    console.log(err);
                    res.status(500).send(err);
                  }
                })
              }
            })
          }
          
        })
    }
    });
  }*/


app.post("/api/insert/bit/", (req, res) => {
  const type = req.body.type;
  const title = req.body.title;
  const category = req.body.category;
  const artist = req.body.artist;
  const airDate = req.body.date;
  
 
  const autoNum = req.body.autoNum;
  const sub1 = req.body.sub1;
  const sub2 = req.body.sub2;
  const sub3 = req.body.sub3;
  const sub4 = req.body.sub4;
  const celebrity1 = req.body.celebrity1;
  const celebrity2 = req.body.celebrity2;
  const sport = req.body.sport;
  const season = req.body.season;
  const keywords = req.body.keywords;
  const hyperlink1 = req.body.hyperlink;
  const hyperlink2 = req.body.hyperlink;
  const hyperlink3 = req.body.hyperlink;
  const hyperlink4 = req.body.hyperlink;
  const hyperlink5 = req.body.hyperlink;
  const hyperlink6 = req.body.hyperlink;
  const album1 = req.body.album1;
  const track1 = req.body.track1;
  const album2 = req.body.album2;
  const track2 = req.body.track2;
  const album3 = req.body.album3;
  const track3 = req.body.track3;
  const album4 = req.body.album4;
  const track4 = req.body.track4;

  
  const time = req.body.time;
  
  
  
  
  const sqlInsert =  "INSERT INTO tblbits (AirDate, Title, ArtistID, ProphetNum, Time, Type) VALUES (?, ?, ?, ?, ?, ?);";
   db.query(sqlInsert, [airDate, title, artist, autoNum, time, type], (err, result) => {
   // console.log(result);
   if(err) {
    console.log(err);
  } else {
    // Retrieve the primary key of the newly inserted row
    const primaryKey = result.insertId;
    // Insert the primary key into a different table
    const sqlInsert2 = "INSERT INTO tblhyperlink (BitID, Hyperlink1, Hyperlink2, Hyperlink3, Hyperlink4, Hyperlink5, Hyperlink6) VALUES (?, ?, ?, ?, ?, ?, ?);";
    db.query(sqlInsert2, [primaryKey, hyperlink1, hyperlink2, hyperlink3, hyperlink4, hyperlink5, hyperlink6], (err, result) => {
      if(err) {
        console.log(err);
      }
    });
  }

   
   });

  
  
});

app.get("/api/get/runSheet/:RS_ID", (req, res) => {
  const RS_ID = req.params.RS_ID;

 const sql = `
  SELECT 
    rk.RS_ID,
    rsd.RSDate,
    e.L_ID,
    e.bTime,
    e.bitDesc,
    e.ArtistID
  FROM tblrunkey rk
  JOIN tblrunentries e ON rk.L_ID = e.L_ID
  JOIN tblrunsheetdate rsd ON rk.RS_ID = rsd.RS_ID
  WHERE rk.RS_ID = ?
  ORDER BY e.bTime ASC
`;

  db.query(sql, [RS_ID], (err, result) => {
    if (err) {
      console.error("Error fetching run sheet:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json(result);
  });
});

app.get("/api/get/celebrity", (req, res) => {
    const sqlSelect = "SELECT * FROM tblcelebkey;";
    db.query(sqlSelect, (err, result) => {
        res.send(result);
    })
})

app.get("/api/get/subject", (req, res) => {
    const sqlSelect = "SELECT * FROM tblsubjectkey;"
    db.query(sqlSelect, (err, result) => {
        res.send(result);
    })
})

app.get("/api/get/artist", (req, res) => {
  
  const sqlSelect = "SELECT * FROM tblartist ORDER BY Name ASC;";
  db.query(sqlSelect, (err, result) =>{
      res.send(result);
  })
})







app.get("/api/get/category", (req, res) => {
    const sqlSelect = "SELECT * FROM tblcatkey;";
    db.query(sqlSelect, (err, result) =>{
        res.send(result);
    })
})

app.get("/api/get/sport", (req, res) => {
    const sqlSelect = "SELECT * FROM tblsportskey;";
    db.query(sqlSelect, (err, result) =>{
        res.send(result);
    })
})

app.get("/api/get/season", (req, res) => {
    const sqlSelect = "SELECT * FROM tblseasonkey;";
    db.query(sqlSelect, (err, result) =>{
        res.send(result);
        
    })
})

app.get("/api/get/album", (req, res) => {
    const sqlSelect = "SELECT * FROM tblalbumkey;";
    db.query(sqlSelect, (err, result) =>{
        res.send(result);
    })
})


// --- Login route ---
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const sql = "SELECT role FROM tbllogin WHERE login = ? AND pass = ?";

  db.query(sql, [username, password], (err, result) => {
    if (err) return res.status(500).send({ error: err });

    if (result.length > 0) {
      req.session.user = {
        username,
        role: result[0].role,
      };

      res.send({
        authenticated: true,
        role: result[0].role,   // <-- REQUIRED
      });
    } else {
      res.send({ authenticated: false });
    }
  });
});

// --- Logout route ---
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ loggedOut: true });
  });
});

// --- Check auth ---
app.get("/api/auth/check", (req, res) => {
  if (req.session.user) {
    res.json({ authenticated: true, user: req.session.user });
  } else {
    res.json({ authenticated: false });
  }
});

// Get all users (admin-only)
app.get("/api/admin/users", (req, res) => {
  if (!req.session.user || !["admin", "owner"].includes(req.session.user.role)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const sql = "SELECT userid, login, role FROM tbllogin ORDER BY userid ASC";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching users:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(result);
  });
});

// --- Add a new user ---
app.post("/api/admin/users", (req, res) => {
  if (!req.session.user || !["admin", "owner"].includes(req.session.user.role)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { username, password, role } = req.body;
  const sql = "INSERT INTO tbllogin (login, pass, role) VALUES (?, ?, ?)";
  db.query(sql, [username, password, role], (err, result) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ message: "User added", userid: result.insertId });
  });
});

// --- Edit user ---
app.put("/api/admin/users/:id", (req, res) => {
  const { username, password, role } = req.body;
  const { id } = req.params;

  let sql;
  let params;

  if (password) {
    // ✅ Update WITH password
    sql = `
      UPDATE tbllogin
      SET login = ?, pass = ?, role = ?
      WHERE userid = ?
    `;
    params = [username, password, role, id];
  } else {
    // ✅ Update WITHOUT touching password
    sql = `
      UPDATE tbllogin
      SET login = ?, role = ?
      WHERE userid = ?
    `;
    params = [username, role, id];
  }

  db.query(sql, params, (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to update user" });
    }
    res.json({ message: "User updated successfully" });
  });
});


// --- Delete user ---
app.delete("/api/admin/users/:userid", (req, res) => {
  if (!req.session.user || !["admin", "owner"].includes(req.session.user.role)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { userid } = req.params;
  const sql = "DELETE FROM tbllogin WHERE userid = ?";
  db.query(sql, [userid], (err) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ message: "User deleted" });
  });
});

app.get("/api/get/bit/info/:searchBitID", (req, res) => {
  const id = req.params.searchBitID;
  const sqlBit = "SELECT bits.BitID, bits.Title, bits.ProphetNum, bits.AirDate, bits.Time, bits.Type FROM tblbits bits WHERE bits.bitID = ?;"
  db.query(sqlBit, id, (err, result) => {
    
    res.send(result);
    
  });
}
);

app.get("/api/get/sport/info/:searchBitID", (req, res) => {
  const id = req.params.searchBitID;
  const sqlSport = "SELECT sportskey.Sport FROM tblsportskey sportskey, tblsports sports WHERE sportskey.SportID = sports.SportID AND sports.bitID = ?;"
  db.query(sqlSport, id, (err, result) => {
    
    res.send(result);
    
  });
}
);

app.get("/api/get/subject/info/:searchBitID", (req, res) => {
  const id = req.params.searchBitID;
  
  const sqlSubject = "SELECT subjectkey.Subject FROM tblsubjectkey subjectkey, tblsubject subject WHERE subject.SubID = subjectkey.SubID AND subject.BitID = ?;" 
  db.query(sqlSubject, id, (err, result) => {
    
    res.send(result);

  });
}
);
app.get("/api/get/celeb1/info/:searchBitID", (req, res) => {
  const id = req.params.searchBitID;
  const sqlCeleb1 = "SELECT celebKey.Name FROM tblceleb celeb, tblcelebkey celebkey WHERE celeb.Celeb1_ID = celebkey.CelebID AND celeb.BitID = ?;"
  db.query(sqlCeleb1, id, (err, result) => {
    res.send(result);
    
  });
}
);

app.get("/api/get/celeb2/info/:searchBitID", (req, res) => {
  const id = req.params.searchBitID;
  const sqlCeleb2 = "SELECT celebKey.Name FROM tblceleb celeb, tblcelebkey celebkey WHERE celeb.Celeb2_ID = celebkey.CelebID AND celeb.BitID = ?;"
  db.query(sqlCeleb2, id, (err, result) => {
    res.send(result);
    
  });
});

app.get("/api/get/season/info/:searchBitID", (req, res) => {
  const id = req.params.searchBitID;
  const sqlSeason = "SELECT seasonkey.Season FROM tblseason season, tblseasonkey seasonkey WHERE season.SeasonID = seasonkey.SeasonID AND season.BitID = ?;"
  db.query(sqlSeason, id, (err, result) => {
    res.send(result);
  });
}
);
app.get("/api/get/category/info/:searchBitID", (req, res) => {
  const id = req.params.searchBitID;
  const sqlCategory = "SELECT catkey.Category FROM tblcatkey catkey, tblcategory category WHERE category.CatID = catkey.CatID AND category.BitID = ?;"
  db.query(sqlCategory, id, (err, result) => {
    res.send(result);
    
  });
}
);

app.get("/api/get/album/info/:searchBitID", (req, res) => {
  const id = req.params.searchBitID;
  const sqlAlbum = "SELECT albumkey.Album_Name, album.Album_Track FROM tblalbumkey albumkey, tblalbum album WHERE album.AlbumID = albumkey.AlbumID AND album.BitID = ?;"
  db.query(sqlAlbum, id, (err, result) => {
    res.send(result);
    
  });
});

app.get("/api/get/hyperlink/info/:searchBitID", (req, res) => {
  const id = req.params.searchBitID;
  const sqlHyperlink = "SELECT * FROM tblhyperlink hyperlink WHERE hyperlink.BitID = ?;"
  db.query(sqlHyperlink, id, (err, result) => {
    res.send(result);
    
  });
});

  
  



app.get("/api/get/log/:searchKeyword/:searchArtist/:searchDate/:searchType", (req, res) => {
  const keyword = req.params.searchKeyword;
  const artist = req.params.searchArtist;
  const date = req.params.searchDate;
  const type = req.params.searchType;
  //console.log(req.params);

  if(type == "Artist"){
    
   // console.log("\nartist: "+ artist);
    const sql1 = "SELECT tblrunentries.bitDesc, tblrunentries.bTime, tblartist.Name, tblrunsheetdate.RSDate, tblrunsheetdate.RS_ID FROM tblrunentries INNER JOIN tblrunkey ON tblrunentries.L_ID = tblrunkey.L_ID INNER JOIN tblrunsheetdate ON tblrunkey.RS_ID = tblrunsheetdate.RS_ID INNER JOIN tblartist ON tblrunentries.ArtistID = tblartist.ArtistID WHERE tblrunentries.ArtistID = ?";

    db.query(sql1, artist, (err, result) => {
      if(err){
        console.log(err);
      }
      //console.log(result);
      //console.log(result);
      res.send(result);
    })
  }
  
  else if(type == "Date"){
    
    const sql2 = "SELECT tblartist.Name, tblartist.ArtistID, tblrunentries.bTime, tblrunentries.L_ID, tblrunentries.bitDesc, tblrunsheetdate.RS_ID, tblrunsheetdate.RSDate FROM tblartist INNER JOIN tblrunentries ON tblrunentries.ArtistID = tblartist.ArtistID INNER JOIN tblrunkey ON tblrunkey.L_ID = tblrunentries.L_ID  INNER JOIN tblrunsheetdate ON tblrunsheetdate.RS_ID = tblrunkey.RS_ID WHERE LOCATE(?, tblrunsheetdate.RSDate) > 0;"
    db.query(sql2, date, (err, result) => {

      if(err){
        console.log(err);
      }

//      console.log(result);
      res.send(result);
    })
  }
  else if(type == "keyword"){
    
    const sql3 = "SELECT tblartist.Name, tblartist.ArtistID, tblrunentries.bTime, tblrunentries.L_ID, tblrunentries.bitDesc, tblrunsheetdate.RS_ID, tblrunsheetdate.RSDate FROM tblrunentries JOIN tblrunkey ON tblrunentries.L_ID = tblrunkey.L_ID  JOIN tblrunsheetdate ON tblrunkey.RS_ID = tblrunsheetdate.RS_ID JOIN tblartist ON tblrunentries.ArtistID = tblartist.ArtistID WHERE LOCATE(?, tblrunentries.bitDesc) > 0";
    db.query(sql3, keyword, (err, result) => {
      if(err){
        console.log(err);
      }
      res.send(result);
    })
  }
  else{
  
  }


});


app.get("/api/get/:searchBitID/:searchKeyword/:searchType", (req, res) => {
  const keyword = req.params.searchKeyword;
  const id = req.params.searchBitID;
  const type = req.params.searchType;

  if (type == "Keyword") {
    const sqlSelect =
      "SELECT bits.BitID, bits.Title, artist.Name, bits.ProphetNum, bits.Time, bits.Type FROM tblbits bits, tblartist artist WHERE bits.artistID = artist.artistID AND LOCATE(?, bits.Title) > 0;";
    db.query(sqlSelect, (keyword, keyword), (err, result) => {
      res.send(result);
    });
  } else if (type=="Bit ID") {
    const sqlSelect =
      "SELECT bits.BitID, bits.Title, artist.Name, bits.ProphetNum, bits.Time, bits.Type FROM tblbits bits, tblartist artist WHERE bits.artistID = artist.artistID AND bits.bitID = ?;";
    db.query(sqlSelect, id, (err, result) => {
      
      res.send(result);
    });
  }
  else if(type=="Artist"){
    const sqlSelect =
      "SELECT bits.BitID, bits.Title, artist.Name, bits.ProphetNum, bits.Time, bits.Type FROM tblbits bits, tblartist artist WHERE bits.artistID = artist.artistID AND LOCATE(?, artist.name) > 0;";
    db.query(sqlSelect, id, (err, result) => {
      res.send(result);
    });

  }



  }
);
/*
app.get("/api/get/supplimental/:searchBitID", (req, res) => {
  const id = req.params.searchBitID;

  const sqlSelect = "SELECT S"
}) 
*/

app.get("/api/get/log/:logID", (req, res) => {
  const id = req.params.logID;
  const sqlSelect = "SELECT runkey.RS_ID FROM tblrunkey runkey WHERE L_ID = ?;"
  db.query(sqlSelect, id, (err, result) => {
    res.send(result);
  });

  
})


app.get("/api/get/log/details/:RS_ID", (req, res) => {
  const RS_ID = req.params.RS_ID;

  if (!RS_ID) return res.status(400).json({ error: "RS_ID is required" });

  const sql = `
    SELECT 
      k.RS_ID,
      d.RSDate,
      e.bTime,
      e.bitDesc,
      a.Name AS ArtistName
    FROM tblrunkey k
    JOIN tblrunentries e ON k.L_ID = e.L_ID
    JOIN tblrunsheetdate d ON k.RS_ID = d.RS_ID
    LEFT JOIN tblartist a ON e.ArtistID = a.ArtistID
    WHERE k.RS_ID = ?
    ORDER BY e.bTime ASC
  `;

  db.query(sql, [RS_ID], (err, result) => {
    if (err) {
      console.error("Error fetching log details:", err);
      return res.status(500).json({ error: "Failed to fetch log details" });
    }
    res.json(result);
  });
});





/*
app.post("/api/update/bit/", (req, res) => {
  const bitID = req.body.bitID; 
  const type = req.body.type;
  const title = req.body.title;
  const category = req.body.category;
  const artist = req.body.artist;
  const bitdate = req.body.date;
  
  const minutes = req.body.minutes;
  const seconds = req.body.seconds;
  const autoNum = req.body.autoNum;
  const sub1 = req.body.sub1;
  const sub2 = req.body.sub2;
  const sub3 = req.body.sub3;
  const sub4 = req.body.sub4;
  const celebrity1 = req.body.celebrity1;
  const celebrity2 = req.body.celebrity2;
  const sport = req.body.sport;
  const season = req.body.season;
  const keywords = req.body.keywords;
  const hyperlink = req.body.hyperlink;
  const album1 = req.body.album1;
  const track1 = req.body.track1;
  const album2 = req.body.album2;
  const track2 = req.body.track2;
  const album3 = req.body.album3;
  const track3 = req.body.track3;
  const album4 = req.body.album4;
  const track4 = req.body.track4;


  const sqlUpdate = "UPDATE tblbits SET type = ?, title = ?, category = ?, artist = ?, minutes = ?, seconds = ? WHERE BitID = ?;"
  db.query(sqlUpdate, [type, title, category, artist, minutes, seconds, bitID], (err, result) => {

  })
})
*/
app.post("/api/update/bit/", (req, res) => {
  const bitID = req.body.bitID; 
  const type = req.body.type;
  const title = req.body.title;
  const category = req.body.category;
  const artist = req.body.artist;
  const bitdate = req.body.date;
  const time = req.body.time;
  const autoNum = req.body.autoNum;
  const sub1 = req.body.sub1;
  const sub2 = req.body.sub2;
  const sub3 = req.body.sub3;
  const sub4 = req.body.sub4;
  const celebrity1 = req.body.celebrity1;
  const celebrity2 = req.body.celebrity2;
  const sport = req.body.sport;
  const season = req.body.season;
  const keywords = req.body.keywords;
  const hyperlink = req.body.hyperlink;
  const album1 = req.body.album1;
  const track1 = req.body.track1;
  const album2 = req.body.album2;
  const track2 = req.body.track2;
  const album3 = req.body.album3;
  const track3 = req.body.track3;
  const album4 = req.body.album4;
  const track4 = req.body.track4;
  
//ArtistID = (SELECT ArtistID FROM tblartist WHERE Name LIKE ?),
  const sqlUpdate = "UPDATE tblbits SET Title = ?, ProphetNum = ?, Time = ?, Type = ? WHERE BitID = ?;"
  const sqlUpdate2 = "UPDATE tblcategory SET CatID = (SELECT CatID from tblcatkey WHERE Category LIKE ?) WHERE BitID = ?"
  //const sqlUpdate3 = 
  //const sqlUpdate4 = 
  //console.log(title+" "+autoNum+" "+ time+" "+ type+" "+ bitID)
  db.query(sqlUpdate, [title, autoNum, time, type, bitID], (err, result) => {
    if(err) {
      console.log(err);
      //return res.status(500).send("Error updating bit");
    }
    
    /*db.query(sqlUpdate2, ["%"+category+"%", bitID], (err, result) => {
      if(err){
        console.log(err);
        return res.status(500).send("Error updating bit");
      }
    }*/

    //);
  
  })
});

app.post("/api/insert/artist/", (req, res) => {
  const name = req.body.name;
  
  

  const sqlInsert = "INSERT INTO tblartist (Name) VALUES (?)";
  db.query(sqlInsert, name, (err, result) => {
    if (err) {
      console.log(err);
    
    }
    
  });
});

app.post("/api/delete/artist", (req, res) =>{
  const id = req.body.deleteArtist;
  
  const sql1 = 'DELETE FROM tblartist WHERE ArtistID = ?'
  db.query(sql1, id, (err, result) => {
    if(err){
      console.log(err);
    }
  
  })
})


app.listen(PORT, () => {
  console.log("Server running on port ${PORT}\n--SERVER LOGS--\n\n");
});
