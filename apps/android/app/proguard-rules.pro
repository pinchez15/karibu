# Keep generic type signatures + annotations so Retrofit and kotlinx-serialization
# can resolve generic return types (ClerkResult<T>, Response<T>, …) and build
# converters. The missing `Signature` attribute is what broke Clerk sign-in
# ("Unable to create converter for interface … ClerkResult").
-keepattributes Signature, Exceptions, InnerClasses, EnclosingMethod, *Annotation*, RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations, AnnotationDefault

# Kotlinx Serialization
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

# Retrofit — keep API method annotations + the generic Call/Response/Continuation
# types so converters can be built for suspend functions.
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
-dontwarn retrofit2.**
-dontwarn javax.annotation.**

# Clerk auth SDK — uses Retrofit + kotlinx-serialization internally
# (ClerkResult<T> return types). Keep it intact so R8 can't strip its generic
# signatures / serializers, which broke sign-in.
-keep class com.clerk.** { *; }
-keepclassmembers class com.clerk.** { *; }
-dontwarn com.clerk.**

# App Retrofit API interfaces — keep so their generic method signatures survive.
-keep interface com.karibuhealth.app.data.remote.api.** { *; }
