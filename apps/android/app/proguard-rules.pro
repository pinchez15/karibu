# Kotlinx Serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.karibuhealth.app.**$$serializer { *; }
-keepclassmembers class com.karibuhealth.app.** { *** Companion; }
-keepclasseswithmembers class com.karibuhealth.app.** { kotlinx.serialization.KSerializer serializer(...); }

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**

# Room
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
# `-keep @androidx.room.Entity class *` keeps @Entity classes but NOT the
# @Embedded/@Relation POJOs (e.g. VisitWithPatient, VisitWithDetails), which are
# plain data classes. Under R8 release optimization their constructors were
# mangled, so the generated DAO passed a null `patient` and the app crashed on
# launch (NullPointerException in VisitWithPatient.<init>). Keep the whole entity
# package (entities + relation POJOs) and the generated DAO implementations.
-keep class com.karibuhealth.app.data.local.db.entity.** { *; }
-keep class com.karibuhealth.app.data.local.db.dao.*_Impl { *; }
